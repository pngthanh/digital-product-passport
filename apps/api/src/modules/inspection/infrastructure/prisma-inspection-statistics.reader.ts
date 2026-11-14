import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type {
  InspectionStatistics,
  InspectionSummary,
  WaitingInspectionRequest,
} from '../application/ports/inspection-statistics.reader.js';

const ITEM_LIMIT = 200;

@Injectable()
export class PrismaInspectionStatistics implements InspectionStatistics {
  constructor(private readonly prisma: PrismaService) {}

  async summary(): Promise<InspectionSummary> {
    const groups = await this.prisma.inspectionRequest.groupBy({
      by: ['requestState'],
      _count: { _all: true },
    });
    const count = (state: string) =>
      groups.find((group) => group.requestState === state)?._count._all ?? 0;
    return {
      pending: count('REQUESTED'),
      completed: count('COMPLETED'),
      declined: count('DECLINED'),
    };
  }

  async requestsWaitingSince(before: Date): Promise<WaitingInspectionRequest[]> {
    const rows = await this.prisma.inspectionRequest.findMany({
      where: { requestState: 'REQUESTED', requestedAt: { lt: before } },
      orderBy: { requestedAt: 'asc' },
      take: ITEM_LIMIT,
    });
    return rows.map((row) => ({
      requestId: row.id,
      productId: row.productId,
      inspectorOrgId: row.inspectorOrgId,
      since: row.requestedAt,
    }));
  }
}
