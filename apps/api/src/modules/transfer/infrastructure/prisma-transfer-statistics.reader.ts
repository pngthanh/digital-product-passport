import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type {
  TransferStatistics,
  TransferSummary,
} from '../application/ports/transfer-statistics.reader.js';

@Injectable()
export class PrismaTransferStatistics implements TransferStatistics {
  constructor(private readonly prisma: PrismaService) {}

  async summary(): Promise<TransferSummary> {
    const groups = await this.prisma.transferRequest.groupBy({
      by: ['transferState'],
      _count: { _all: true },
    });
    const count = (state: string) =>
      groups.find((group) => group.transferState === state)?._count._all ?? 0;
    return {
      pending: count('REQUESTED'),
      completed: count('COMPLETED'),
      rejected: count('REJECTED'),
      cancelled: count('CANCELLED'),
      expired: count('EXPIRED'),
    };
  }
}
