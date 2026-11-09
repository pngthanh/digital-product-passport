import { Injectable } from '@nestjs/common';
import type { InspectionFilter } from '@dpp/shared';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import type {
  Inspection,
  InspectionRequest,
  Prisma,
} from '../../../infrastructure/database/generated/client.js';
import { isUniqueViolation } from '../../../infrastructure/database/prisma-errors.js';
import { prismaFrom } from '../../../infrastructure/database/prisma-scope.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type {
  InspectionConfirmation,
  InspectionListQuery,
  InspectionRequestRepository,
  NewInspection,
  NewInspectionRequest,
} from '../application/ports/inspection-request.repository.js';
import type { InspectionRequestRecord, InspectionRow } from '../domain/inspection-request.js';
import { InspectionRequestPendingError } from '../domain/inspection.errors.js';

function toRequest(row: InspectionRequest): InspectionRequestRecord {
  return {
    id: row.id,
    productId: row.productId,
    requestedByPartyId: row.requestedByPartyId,
    inspectorOrgId: row.inspectorOrgId,
    note: row.note,
    requestState: row.requestState,
    requestedAt: row.requestedAt,
    closedAt: row.closedAt,
    declineReason: row.declineReason,
  };
}

function toInspection(row: Inspection): InspectionRow {
  return {
    id: row.id,
    requestId: row.requestId,
    productId: row.productId,
    inspectorOrgId: row.inspectorOrgId,
    result: row.result,
    summary: row.summary,
    reportUrl: row.reportUrl,
    reportHash: row.reportHash,
    chainInspectionId: row.chainInspectionId,
    inspectedAt: row.inspectedAt,
    txHash: row.txHash,
    syncStatus: row.syncStatus,
    createdAt: row.createdAt,
  };
}

function filterWhere(filter: InspectionFilter): Prisma.InspectionRequestWhereInput {
  if (filter === 'CLOSED') {
    return { requestState: { in: ['DECLINED', 'CANCELLED'] } };
  }
  return { requestState: filter };
}

@Injectable()
export class PrismaInspectionRequestRepository implements InspectionRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(request: NewInspectionRequest): Promise<InspectionRequestRecord> {
    try {
      const row = await this.prisma.inspectionRequest.create({ data: { ...request } });
      return toRequest(row);
    } catch (error) {
      // Cột UNIQUE duy nhất khi tạo mới là ux_inspection_one_pending.
      if (isUniqueViolation(error)) {
        throw new InspectionRequestPendingError();
      }
      throw error;
    }
  }

  async findById(id: string, scope?: TransactionScope): Promise<InspectionRequestRecord | null> {
    const row = await prismaFrom(this.prisma, scope).inspectionRequest.findUnique({
      where: { id },
    });
    return row && toRequest(row);
  }

  async listForProduct(productId: string): Promise<InspectionRequestRecord[]> {
    const rows = await this.prisma.inspectionRequest.findMany({
      where: { productId },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toRequest);
  }

  async listForInspector(
    query: InspectionListQuery,
  ): Promise<{ items: InspectionRequestRecord[]; total: number }> {
    const where: Prisma.InspectionRequestWhereInput = {
      inspectorOrgId: query.inspectorOrgId,
      ...filterWhere(query.filter),
    };
    // Chờ kiểm định: cũ nhất trước (đến trước làm trước); đã có kết quả, đã đóng: mới nhất trước.
    const orderBy: Prisma.InspectionRequestOrderByWithRelationInput[] =
      query.filter === 'REQUESTED'
        ? [{ requestedAt: 'asc' }, { id: 'asc' }]
        : [{ closedAt: 'desc' }, { id: 'desc' }];
    const [rows, total] = await Promise.all([
      this.prisma.inspectionRequest.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.inspectionRequest.count({ where }),
    ]);
    return { items: rows.map(toRequest), total };
  }

  async countsForInspector(inspectorOrgId: string): Promise<Record<InspectionFilter, number>> {
    const count = (filter: InspectionFilter) =>
      this.prisma.inspectionRequest.count({ where: { inspectorOrgId, ...filterWhere(filter) } });
    const [requested, completed, closed] = await Promise.all([
      count('REQUESTED'),
      count('COMPLETED'),
      count('CLOSED'),
    ]);
    return { REQUESTED: requested, COMPLETED: completed, CLOSED: closed };
  }

  async cancel(id: string, at: Date): Promise<boolean> {
    const { count } = await this.prisma.inspectionRequest.updateMany({
      where: { id, requestState: 'REQUESTED' },
      data: { requestState: 'CANCELLED', closedAt: at },
    });
    return count === 1;
  }

  async decline(id: string, reason: string, at: Date): Promise<boolean> {
    const { count } = await this.prisma.inspectionRequest.updateMany({
      where: { id, requestState: 'REQUESTED' },
      data: { requestState: 'DECLINED', declineReason: reason, closedAt: at },
    });
    return count === 1;
  }

  async markCompleted(requestId: string, at: Date, scope: TransactionScope): Promise<boolean> {
    const { count } = await prismaFrom(this.prisma, scope).inspectionRequest.updateMany({
      where: { id: requestId, requestState: { not: 'COMPLETED' } },
      data: { requestState: 'COMPLETED', declineReason: null, closedAt: at },
    });
    return count === 1;
  }

  async inspectionsOf(requestIds: readonly string[]): Promise<Map<string, InspectionRow[]>> {
    const result = new Map<string, InspectionRow[]>();
    if (requestIds.length === 0) {
      return result;
    }
    const rows = await this.prisma.inspection.findMany({
      where: { requestId: { in: [...new Set(requestIds)] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    for (const row of rows) {
      const list = result.get(row.requestId) ?? [];
      list.push(toInspection(row));
      result.set(row.requestId, list);
    }
    return result;
  }

  async savePendingInspection(inspection: NewInspection): Promise<InspectionRow> {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.inspection.deleteMany({
        where: { requestId: inspection.requestId, syncStatus: 'PENDING' },
      });
      return tx.inspection.create({ data: { ...inspection, syncStatus: 'PENDING' } });
    });
    return toInspection(row);
  }

  async confirmInspection(
    requestId: string,
    reportHash: string,
    confirmation: InspectionConfirmation,
    scope: TransactionScope,
  ): Promise<boolean> {
    const db = prismaFrom(this.prisma, scope);
    const match = await db.inspection.findFirst({
      where: { requestId, syncStatus: 'PENDING', reportHash: reportHash.toLowerCase() },
      orderBy: { createdAt: 'desc' },
    });
    await db.inspection.updateMany({
      where: { requestId, syncStatus: 'PENDING', ...(match ? { id: { not: match.id } } : {}) },
      data: { syncStatus: 'FAILED' },
    });
    if (!match) {
      return false;
    }
    await db.inspection.update({
      where: { id: match.id },
      data: {
        syncStatus: 'CONFIRMED',
        chainInspectionId: confirmation.chainInspectionId.toLowerCase(),
        txHash: confirmation.txHash,
        inspectedAt: confirmation.inspectedAt,
      },
    });
    return true;
  }
}
