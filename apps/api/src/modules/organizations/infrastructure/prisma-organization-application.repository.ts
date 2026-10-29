import { Injectable } from '@nestjs/common';
import type { AuthStatus } from '@dpp/shared';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import type { OrganizationApplication } from '../../../infrastructure/database/generated/client.js';
import { prismaFrom } from '../../../infrastructure/database/prisma-scope.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type {
  AppliedRound,
  OrganizationApplicationRepository,
  RoundDecision,
} from '../application/ports/organization-application.repository.js';
import type {
  ApplicationStatus,
  OrganizationApplicationRecord,
} from '../domain/organization-application.js';

/** CHECK ck_org_applications_status loại DISABLED: khoá là việc của tổ chức, không của lần nộp. */
function applicationStatusOf(status: AuthStatus): ApplicationStatus {
  if (status === 'DISABLED') {
    throw new Error('organization_applications không có trạng thái DISABLED');
  }
  return status;
}

function toRecord(row: OrganizationApplication): OrganizationApplicationRecord {
  const hasSnapshot = row.name !== null && row.taxCode !== null && row.contactEmail !== null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    round: row.round,
    orgType: row.orgType,
    profile: hasSnapshot
      ? {
          name: row.name ?? '',
          taxCode: row.taxCode ?? '',
          orgType: row.orgType,
          contactEmail: row.contactEmail ?? '',
          contactPhone: row.contactPhone,
          address: row.address,
        }
      : null,
    profileHash: row.profileHash,
    applicantAddress: row.applicantAddress,
    appliedTxHash: row.appliedTxHash,
    appliedAt: row.appliedAt,
    feePaymentId: row.feePaymentId,
    status: applicationStatusOf(row.status),
    decisionReason: row.decisionReason,
    decisionReasonHash: row.decisionReasonHash,
    decidedByAddress: row.decidedByAddress,
    decidedTxHash: row.decidedTxHash,
    decidedAt: row.decidedAt,
  };
}

@Injectable()
export class PrismaOrganizationApplicationRepository implements OrganizationApplicationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listFor(organizationId: string): Promise<OrganizationApplicationRecord[]> {
    const rows = await this.prisma.organizationApplication.findMany({
      where: { organizationId },
      orderBy: { round: 'desc' },
    });
    return rows.map(toRecord);
  }

  async recordApplied(round: AppliedRound, scope: TransactionScope): Promise<void> {
    const db = prismaFrom(this.prisma, scope);
    // Chỉ Worker ghi và mỗi event được chiếu đúng một lần, nên lấy số lần nộp kế tiếp như vậy là đủ.
    const latest = await db.organizationApplication.findFirst({
      where: { organizationId: round.organizationId },
      orderBy: { round: 'desc' },
      select: { round: true },
    });
    const profile = round.profile;
    await db.organizationApplication.createMany({
      data: [
        {
          organizationId: round.organizationId,
          round: (latest?.round ?? 0) + 1,
          name: profile?.name ?? null,
          taxCode: profile?.taxCode ?? null,
          contactEmail: profile?.contactEmail ?? null,
          contactPhone: profile?.contactPhone ?? null,
          address: profile?.address ?? null,
          orgType: round.orgType,
          profileHash: round.profileHash,
          applicantAddress: round.applicantAddress.toLowerCase(),
          appliedTxHash: round.txHash,
          appliedAt: round.appliedAt,
        },
      ],
      skipDuplicates: true,
    });
  }

  async attachFee(
    appliedTxHash: string,
    feePaymentId: string,
    scope: TransactionScope,
  ): Promise<void> {
    await prismaFrom(this.prisma, scope).organizationApplication.updateMany({
      where: { appliedTxHash, feePaymentId: null },
      data: { feePaymentId },
    });
  }

  async saveDecisionReason(organizationId: string, reason: string): Promise<void> {
    await this.prisma.organizationApplication.updateMany({
      where: { organizationId, status: 'PENDING' },
      data: { decisionReason: reason },
    });
  }

  async decide(
    organizationId: string,
    decision: RoundDecision,
    scope: TransactionScope,
  ): Promise<OrganizationApplicationRecord | null> {
    const db = prismaFrom(this.prisma, scope);
    const pending = await db.organizationApplication.findFirst({
      where: { organizationId, status: 'PENDING' },
    });
    if (!pending) {
      return null;
    }
    const row = await db.organizationApplication.update({
      where: { id: pending.id },
      data: {
        status: decision.status,
        decidedByAddress: decision.decidedBy.toLowerCase(),
        decidedTxHash: decision.txHash,
        decidedAt: decision.at,
        ...(decision.status === 'REJECTED'
          ? { decisionReasonHash: decision.reasonHash }
          : // Lý do soạn sẵn cho lần từ chối không gửi đi thì không còn ý nghĩa khi đơn được duyệt.
            { decisionReason: null }),
      },
    });
    return toRecord(row);
  }
}
