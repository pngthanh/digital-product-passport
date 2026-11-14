import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type {
  OverdueServiceItem,
  ServiceStatistics,
  ServiceSummary,
} from '../application/ports/service-statistics.reader.js';

const ITEM_LIMIT = 200;

@Injectable()
export class PrismaServiceStatistics implements ServiceStatistics {
  constructor(private readonly prisma: PrismaService) {}

  async summary(): Promise<ServiceSummary> {
    const groups = await this.prisma.serviceRequest.groupBy({
      by: ['serviceState'],
      _count: { _all: true },
    });
    const count = (state: string) =>
      groups.find((group) => group.serviceState === state)?._count._all ?? 0;
    return {
      pending: count('REQUESTED'),
      inRepair: count('IN_REPAIR'),
      repaired: count('REPAIRED'),
      notRepaired: count('REJECTED'),
    };
  }

  async ticketsOpenedBefore(before: Date): Promise<OverdueServiceItem[]> {
    const rows = await this.prisma.serviceRequest.findMany({
      where: { serviceState: 'IN_REPAIR', openedAt: { lt: before } },
      orderBy: { openedAt: 'asc' },
      take: ITEM_LIMIT,
    });
    return rows.map((row) => ({
      requestId: row.id,
      productId: row.productId,
      serviceCenterOrgId: row.serviceCenterOrgId,
      since: row.openedAt ?? row.requestedAt,
    }));
  }

  async requestsWaitingSince(before: Date): Promise<OverdueServiceItem[]> {
    const rows = await this.prisma.serviceRequest.findMany({
      where: { serviceState: 'REQUESTED', requestedAt: { lt: before } },
      orderBy: { requestedAt: 'asc' },
      take: ITEM_LIMIT,
    });
    return rows.map((row) => ({
      requestId: row.id,
      productId: row.productId,
      serviceCenterOrgId: row.serviceCenterOrgId,
      since: row.requestedAt,
    }));
  }
}
