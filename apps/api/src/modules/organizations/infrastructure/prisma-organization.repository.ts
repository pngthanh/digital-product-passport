import { Injectable } from '@nestjs/common';
import type { OrganizationStage } from '@dpp/shared';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import type { Organization, Prisma } from '../../../infrastructure/database/generated/client.js';
import { isUniqueViolation } from '../../../infrastructure/database/prisma-errors.js';
import { prismaFrom } from '../../../infrastructure/database/prisma-scope.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type {
  DraftInput,
  OrganizationRepository,
  StatusProjection,
} from '../application/ports/organization.repository.js';
import type { OrganizationRecord } from '../domain/organization.js';
import { TaxCodeTakenError } from '../domain/organizations.errors.js';

const STAGES: readonly OrganizationStage[] = [
  'DRAFT',
  'PENDING',
  'AUTHORIZED',
  'REJECTED',
  'DISABLED',
];

function toRecord(row: Organization): OrganizationRecord {
  return {
    id: row.id,
    representativeUserId: row.representativeUserId,
    name: row.name,
    taxCode: row.taxCode,
    orgType: row.orgType,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    address: row.address,
    profileHash: row.profileHash,
    authStatus: row.authStatus,
    statusReason: row.statusReason,
    appliedAt: row.appliedAt,
    approvedAt: row.approvedAt,
    rejectedAt: row.rejectedAt,
    disabledAt: row.disabledAt,
    createdAt: row.createdAt,
  };
}

function stageFilter(stage: OrganizationStage): Prisma.OrganizationWhereInput {
  if (stage === 'DRAFT') {
    return { authStatus: 'PENDING', appliedAt: null };
  }
  if (stage === 'PENDING') {
    return { authStatus: 'PENDING', appliedAt: { not: null } };
  }
  return { authStatus: stage };
}

function profileData(input: DraftInput) {
  return {
    name: input.name,
    taxCode: input.taxCode,
    orgType: input.orgType,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,
    address: input.address,
    profileHash: input.profileHash,
  };
}

@Injectable()
export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<OrganizationRecord | null> {
    const row = await this.prisma.organization.findUnique({ where: { id } });
    return row && toRecord(row);
  }

  async findByRepresentative(userId: string): Promise<OrganizationRecord | null> {
    const row = await this.prisma.organization.findUnique({
      where: { representativeUserId: userId },
    });
    return row && toRecord(row);
  }

  async findByTaxCode(taxCode: string): Promise<OrganizationRecord | null> {
    const row = await this.prisma.organization.findUnique({ where: { taxCode } });
    return row && toRecord(row);
  }

  async list(stages: readonly OrganizationStage[]): Promise<OrganizationRecord[]> {
    const where: Prisma.OrganizationWhereInput =
      stages.length > 0
        ? { OR: stages.map(stageFilter) }
        : { NOT: { authStatus: 'PENDING', appliedAt: null } };
    const rows = await this.prisma.organization.findMany({
      where,
      orderBy: [{ appliedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
    return rows.map(toRecord);
  }

  async countByStage(): Promise<Record<OrganizationStage, number>> {
    const [DRAFT, PENDING, AUTHORIZED, REJECTED, DISABLED] = await Promise.all(
      STAGES.map((stage) => this.prisma.organization.count({ where: stageFilter(stage) })),
    );
    return {
      DRAFT: DRAFT ?? 0,
      PENDING: PENDING ?? 0,
      AUTHORIZED: AUTHORIZED ?? 0,
      REJECTED: REJECTED ?? 0,
      DISABLED: DISABLED ?? 0,
    };
  }

  async createDraft(input: DraftInput, scope: TransactionScope): Promise<OrganizationRecord> {
    try {
      const row = await prismaFrom(this.prisma, scope).organization.create({
        data: { ...profileData(input), representativeUserId: input.representativeUserId },
      });
      return toRecord(row);
    } catch (error) {
      if (isUniqueViolation(error, 'tax_code')) {
        throw new TaxCodeTakenError();
      }
      throw error;
    }
  }

  async updateProfile(id: string, input: DraftInput): Promise<OrganizationRecord> {
    try {
      const row = await this.prisma.organization.update({
        where: { id },
        data: profileData(input),
      });
      return toRecord(row);
    } catch (error) {
      if (isUniqueViolation(error, 'tax_code')) {
        throw new TaxCodeTakenError();
      }
      throw error;
    }
  }

  async saveStatusReason(id: string, reason: string): Promise<void> {
    await this.prisma.organization.update({ where: { id }, data: { statusReason: reason } });
  }

  async applyStatus(
    id: string,
    projection: StatusProjection,
    scope: TransactionScope,
  ): Promise<boolean> {
    const data: Prisma.OrganizationUpdateManyMutationInput =
      projection.status === 'PENDING'
        ? {
            authStatus: 'PENDING',
            appliedAt: projection.at,
            profileHash: projection.profileHash,
            orgType: projection.orgType,
            // Đơn nộp lại: lý do từ chối cũ không còn áp dụng (vẫn còn trong audit_logs).
            statusReason: null,
          }
        : projection.status === 'AUTHORIZED'
          ? { authStatus: 'AUTHORIZED', approvedAt: projection.at }
          : projection.status === 'REJECTED'
            ? { authStatus: 'REJECTED', rejectedAt: projection.at }
            : { authStatus: 'DISABLED', disabledAt: projection.at };
    const { count } = await prismaFrom(this.prisma, scope).organization.updateMany({
      where: { id },
      data,
    });
    return count === 1;
  }
}
