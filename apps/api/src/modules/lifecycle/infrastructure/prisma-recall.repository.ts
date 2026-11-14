import { Injectable } from '@nestjs/common';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import type { Recall } from '../../../infrastructure/database/generated/client.js';
import { prismaFrom } from '../../../infrastructure/database/prisma-scope.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { PendingRecall, RecallRepository } from '../application/ports/recall.repository.js';
import type { RecallRecord } from '../domain/recall.js';

function toRecord(row: Recall): RecallRecord {
  return {
    id: row.id,
    productId: row.productId,
    issuerOrgId: row.issuerOrgId,
    reason: row.reason,
    reasonHash: row.reasonHash,
    recalledAt: row.recalledAt,
    txHash: row.txHash,
    confirmed: row.syncStatus === 'CONFIRMED',
  };
}

@Injectable()
export class PrismaRecallRepository implements RecallRepository {
  constructor(private readonly prisma: PrismaService) {}

  async savePending(recalls: readonly PendingRecall[]): Promise<void> {
    await this.prisma.$transaction(
      recalls.map((recall) =>
        this.prisma.recall.upsert({
          where: { productId: recall.productId },
          create: { ...recall, syncStatus: 'PENDING' },
          update: { reason: recall.reason, reasonHash: recall.reasonHash },
        }),
      ),
    );
  }

  async findByProduct(productId: string, scope?: TransactionScope): Promise<RecallRecord | null> {
    const row = await prismaFrom(this.prisma, scope).recall.findUnique({ where: { productId } });
    return row && toRecord(row);
  }

  async confirm(
    productId: string,
    reasonHash: string,
    chain: { txHash: string; at: Date },
    scope: TransactionScope,
  ): Promise<boolean> {
    const { count } = await prismaFrom(this.prisma, scope).recall.updateMany({
      where: { productId, reasonHash: reasonHash.toLowerCase() },
      data: { syncStatus: 'CONFIRMED', txHash: chain.txHash, recalledAt: chain.at },
    });
    return count === 1;
  }

  async confirmWithoutReason(
    recall: { productId: string; issuerOrgId: string; reasonHash: string; reason: string },
    chain: { txHash: string; at: Date },
    scope: TransactionScope,
  ): Promise<void> {
    const data = {
      issuerOrgId: recall.issuerOrgId,
      reason: recall.reason,
      reasonHash: recall.reasonHash.toLowerCase(),
      syncStatus: 'CONFIRMED' as const,
      txHash: chain.txHash,
      recalledAt: chain.at,
    };
    await prismaFrom(this.prisma, scope).recall.upsert({
      where: { productId: recall.productId },
      create: { productId: recall.productId, ...data },
      update: data,
    });
  }
}
