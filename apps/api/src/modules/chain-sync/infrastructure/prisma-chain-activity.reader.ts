import { Injectable } from '@nestjs/common';
import type { TransactionMethodStats } from '@dpp/shared';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type {
  ChainActivity,
  RevertBurst,
  StuckTransaction,
  TransactionStatusCounts,
} from '../application/chain-activity.reader.js';

const ITEM_LIMIT = 200;

@Injectable()
export class PrismaChainActivity implements ChainActivity {
  constructor(private readonly prisma: PrismaService) {}

  async transactions(
    since: Date,
  ): Promise<{ byStatus: TransactionStatusCounts; methods: TransactionMethodStats[] }> {
    const [statuses, methods] = await Promise.all([
      this.prisma.chainTransaction.groupBy({
        by: ['txStatus'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<
        Array<{
          contract_name: string;
          method: string;
          total: bigint;
          confirmed: bigint;
          reverted: bigint;
          avg_gas: string | null;
          avg_seconds: number | null;
        }>
      >`
        SELECT contract_name,
               method,
               count(*) AS total,
               count(*) FILTER (WHERE tx_status = 'CONFIRMED') AS confirmed,
               count(*) FILTER (WHERE tx_status = 'REVERTED') AS reverted,
               round(avg(gas_used) FILTER (WHERE tx_status = 'CONFIRMED'))::text AS avg_gas,
               (avg(extract(epoch FROM confirmed_at - submitted_at))
                  FILTER (WHERE tx_status = 'CONFIRMED' AND submitted_at IS NOT NULL))::float8 AS avg_seconds
          FROM chain_transactions
         WHERE created_at >= ${since}
         GROUP BY contract_name, method
         ORDER BY count(*) DESC, contract_name, method
      `,
    ]);
    const byStatus: TransactionStatusCounts = {
      QUEUED: 0,
      SUBMITTED: 0,
      CONFIRMED: 0,
      REVERTED: 0,
      FAILED: 0,
    };
    for (const group of statuses) {
      byStatus[group.txStatus] = group._count._all;
    }
    return {
      byStatus,
      methods: methods.map((row) => ({
        contractName: row.contract_name,
        method: row.method,
        total: Number(row.total),
        confirmed: Number(row.confirmed),
        reverted: Number(row.reverted),
        averageGasUsed: row.avg_gas,
        averageConfirmSeconds:
          row.avg_seconds === null ? null : Math.round(row.avg_seconds * 10) / 10,
      })),
    };
  }

  async dailyEvents(since: Date, timeZone: string): Promise<{ day: string; events: number }[]> {
    const rows = await this.prisma.$queryRaw<Array<{ day: string; events: bigint }>>`
      SELECT to_char(block_timestamp AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day,
             count(*) AS events
        FROM blockchain_events
       WHERE finality_status = 'FINALIZED' AND block_timestamp >= ${since}
       GROUP BY 1
       ORDER BY 1
    `;
    return rows.map((row) => ({ day: row.day, events: Number(row.events) }));
  }

  async stuckTransactions(submittedBefore: Date): Promise<StuckTransaction[]> {
    const rows = await this.prisma.chainTransaction.findMany({
      where: { txStatus: 'SUBMITTED', submittedAt: { lt: submittedBefore }, txHash: { not: null } },
      orderBy: { submittedAt: 'asc' },
      take: ITEM_LIMIT,
    });
    return rows.flatMap((row) =>
      row.txHash && row.submittedAt
        ? [
            {
              txHash: row.txHash,
              fromAddress: row.fromAddress,
              contractName: row.contractName,
              method: row.method,
              submittedAt: row.submittedAt,
              initiatedByUserId: row.initiatedByUserId,
            },
          ]
        : [],
    );
  }

  async revertBursts(since: Date, minReverts: number): Promise<RevertBurst[]> {
    const groups = await this.prisma.chainTransaction.groupBy({
      by: ['fromAddress'],
      where: { txStatus: 'REVERTED', updatedAt: { gte: since } },
      _count: { _all: true },
      having: { fromAddress: { _count: { gte: minReverts } } },
    });
    return groups.map((group) => ({ fromAddress: group.fromAddress, reverts: group._count._all }));
  }
}
