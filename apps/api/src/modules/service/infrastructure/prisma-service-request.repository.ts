import { Injectable } from '@nestjs/common';
import {
  SERVICE_ACTION_CODES,
  type ServiceActionCode,
  type ServiceTicketFilter,
} from '@dpp/shared';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import type {
  Prisma,
  ServiceRecord,
  ServiceRequest,
} from '../../../infrastructure/database/generated/client.js';
import { isUniqueViolation } from '../../../infrastructure/database/prisma-errors.js';
import { prismaFrom } from '../../../infrastructure/database/prisma-scope.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type {
  NewServiceRecord,
  NewServiceRequest,
  ServiceRequestRepository,
  ServiceTicketQuery,
  TicketClosedProjection,
  TicketOpenedProjection,
} from '../application/ports/service-request.repository.js';
import type { ServiceRecordRow, ServiceRequestRecord } from '../domain/service-request.js';
import { ServiceRequestOpenError } from '../domain/service.errors.js';

function toRequest(row: ServiceRequest): ServiceRequestRecord {
  return {
    id: row.id,
    productId: row.productId,
    requestedByPartyId: row.requestedByPartyId,
    serviceCenterOrgId: row.serviceCenterOrgId,
    issueDesc: row.issueDesc,
    serviceState: row.serviceState,
    requestedAt: row.requestedAt,
    cancelledAt: row.cancelledAt,
    chainTicketId: row.chainTicketId,
    warrantyCovered: row.warrantyCovered,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    openTxHash: row.openTxHash,
    closeTxHash: row.closeTxHash,
  };
}

function actionCodeOf(value: string): ServiceActionCode {
  return SERVICE_ACTION_CODES.find((code) => code === value) ?? 'OTHER';
}

function toRecord(row: ServiceRecord): ServiceRecordRow {
  return {
    id: row.id,
    serviceRequestId: row.serviceRequestId,
    actionCode: actionCodeOf(row.actionCode),
    actionDetail: row.actionDetail,
    evidenceUrl: row.evidenceUrl,
    evidenceHash: row.evidenceHash,
    recordedAt: row.recordedAt,
    txHash: row.txHash,
    syncStatus: row.syncStatus,
    createdAt: row.createdAt,
  };
}

function filterWhere(filter: ServiceTicketFilter): Prisma.ServiceRequestWhereInput {
  if (filter === 'CLOSED') {
    return { serviceState: { in: ['REPAIRED', 'REJECTED'] } };
  }
  return { serviceState: filter };
}

@Injectable()
export class PrismaServiceRequestRepository implements ServiceRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(request: NewServiceRequest): Promise<ServiceRequestRecord> {
    try {
      const row = await this.prisma.serviceRequest.create({ data: { ...request } });
      return toRequest(row);
    } catch (error) {
      // Cột UNIQUE duy nhất khi tạo mới là ux_service_one_open (chain_ticket_id còn NULL).
      if (isUniqueViolation(error)) {
        throw new ServiceRequestOpenError();
      }
      throw error;
    }
  }

  async findById(id: string, scope?: TransactionScope): Promise<ServiceRequestRecord | null> {
    const row = await prismaFrom(this.prisma, scope).serviceRequest.findUnique({ where: { id } });
    return row && toRequest(row);
  }

  async listForProduct(productId: string): Promise<ServiceRequestRecord[]> {
    const rows = await this.prisma.serviceRequest.findMany({
      where: { productId },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toRequest);
  }

  async listForCenter(
    query: ServiceTicketQuery,
  ): Promise<{ items: ServiceRequestRecord[]; total: number }> {
    const where: Prisma.ServiceRequestWhereInput = {
      serviceCenterOrgId: query.serviceCenterOrgId,
      ...filterWhere(query.filter),
    };
    // Chờ tiếp nhận: cũ nhất trước (đến trước làm trước); đang sửa, đã đóng: mới nhất trước.
    const orderBy: Prisma.ServiceRequestOrderByWithRelationInput[] =
      query.filter === 'REQUESTED'
        ? [{ requestedAt: 'asc' }, { id: 'asc' }]
        : query.filter === 'IN_REPAIR'
          ? [{ openedAt: 'desc' }, { id: 'desc' }]
          : [{ closedAt: 'desc' }, { id: 'desc' }];
    const [rows, total] = await Promise.all([
      this.prisma.serviceRequest.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.serviceRequest.count({ where }),
    ]);
    return { items: rows.map(toRequest), total };
  }

  async countsForCenter(serviceCenterOrgId: string): Promise<Record<ServiceTicketFilter, number>> {
    const count = (filter: ServiceTicketFilter) =>
      this.prisma.serviceRequest.count({ where: { serviceCenterOrgId, ...filterWhere(filter) } });
    const [requested, inRepair, closed] = await Promise.all([
      count('REQUESTED'),
      count('IN_REPAIR'),
      count('CLOSED'),
    ]);
    return { REQUESTED: requested, IN_REPAIR: inRepair, CLOSED: closed };
  }

  async cancel(id: string, at: Date): Promise<boolean> {
    const { count } = await this.prisma.serviceRequest.updateMany({
      where: { id, serviceState: 'REQUESTED' },
      data: { serviceState: 'CANCELLED', cancelledAt: at },
    });
    return count === 1;
  }

  async cancelRequestedBy(
    productId: string,
    requestedByPartyId: string,
    at: Date,
    scope: TransactionScope,
  ): Promise<number> {
    const { count } = await prismaFrom(this.prisma, scope).serviceRequest.updateMany({
      where: { productId, requestedByPartyId, serviceState: 'REQUESTED' },
      data: { serviceState: 'CANCELLED', cancelledAt: at },
    });
    return count;
  }

  async cancelAllRequested(productId: string, at: Date, scope: TransactionScope): Promise<number> {
    const { count } = await prismaFrom(this.prisma, scope).serviceRequest.updateMany({
      where: { productId, serviceState: 'REQUESTED' },
      data: { serviceState: 'CANCELLED', cancelledAt: at },
    });
    return count;
  }

  async cancelOtherRequests(
    productId: string,
    exceptId: string,
    at: Date,
    scope: TransactionScope,
  ): Promise<number> {
    const { count } = await prismaFrom(this.prisma, scope).serviceRequest.updateMany({
      where: { productId, id: { not: exceptId }, serviceState: 'REQUESTED' },
      data: { serviceState: 'CANCELLED', cancelledAt: at },
    });
    return count;
  }

  async markOpened(projection: TicketOpenedProjection, scope: TransactionScope): Promise<boolean> {
    const { count } = await prismaFrom(this.prisma, scope).serviceRequest.updateMany({
      where: { id: projection.requestId, serviceState: { in: ['REQUESTED', 'CANCELLED'] } },
      data: {
        serviceState: 'IN_REPAIR',
        cancelledAt: null,
        chainTicketId: projection.chainTicketId.toLowerCase(),
        warrantyCovered: projection.warrantyCovered,
        openedAt: projection.openedAt,
        openTxHash: projection.openTxHash,
      },
    });
    return count === 1;
  }

  async markClosed(projection: TicketClosedProjection, scope: TransactionScope): Promise<boolean> {
    const { count } = await prismaFrom(this.prisma, scope).serviceRequest.updateMany({
      where: { id: projection.requestId, serviceState: 'IN_REPAIR' },
      data: {
        serviceState: projection.state,
        closedAt: projection.closedAt,
        closeTxHash: projection.closeTxHash,
      },
    });
    return count === 1;
  }

  async recordsOf(requestIds: readonly string[]): Promise<Map<string, ServiceRecordRow[]>> {
    const result = new Map<string, ServiceRecordRow[]>();
    if (requestIds.length === 0) {
      return result;
    }
    const rows = await this.prisma.serviceRecord.findMany({
      where: { serviceRequestId: { in: [...new Set(requestIds)] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    for (const row of rows) {
      const list = result.get(row.serviceRequestId) ?? [];
      list.push(toRecord(row));
      result.set(row.serviceRequestId, list);
    }
    return result;
  }

  async savePendingRecord(record: NewServiceRecord): Promise<ServiceRecordRow> {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.serviceRecord.deleteMany({
        where: { serviceRequestId: record.serviceRequestId, syncStatus: 'PENDING' },
      });
      return tx.serviceRecord.create({ data: { ...record, syncStatus: 'PENDING' } });
    });
    return toRecord(row);
  }

  async confirmRecord(
    requestId: string,
    evidenceHash: string,
    confirmation: { txHash: string; recordedAt: Date },
    scope: TransactionScope,
  ): Promise<boolean> {
    const db = prismaFrom(this.prisma, scope);
    const hash = evidenceHash.toLowerCase();
    const match = await db.serviceRecord.findFirst({
      where: { serviceRequestId: requestId, syncStatus: 'PENDING', evidenceHash: hash },
      orderBy: { createdAt: 'desc' },
    });
    await db.serviceRecord.updateMany({
      where: {
        serviceRequestId: requestId,
        syncStatus: 'PENDING',
        ...(match ? { id: { not: match.id } } : {}),
      },
      data: { syncStatus: 'FAILED' },
    });
    if (!match) {
      return false;
    }
    await db.serviceRecord.update({
      where: { id: match.id },
      data: {
        syncStatus: 'CONFIRMED',
        txHash: confirmation.txHash,
        recordedAt: confirmation.recordedAt,
      },
    });
    return true;
  }
}
