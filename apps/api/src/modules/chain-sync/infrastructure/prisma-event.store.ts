import { Inject, Injectable } from '@nestjs/common';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import { prismaFrom } from '../../../infrastructure/database/prisma-scope.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { EventStore } from '../application/event-store.port.js';
import type { BlockRange } from '../domain/block-range.js';
import type { ChainEvent } from '../domain/chain-event.js';

@Injectable()
export class PrismaEventStore implements EventStore {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async finalize(event: ChainEvent, scope: TransactionScope): Promise<boolean> {
    const db = prismaFrom(this.prisma, scope);
    const finalizedAt = this.clock.now();
    // UPDATE khoá dòng: hai tiến trình cùng chốt một event thì chỉ một bên thấy count = 1.
    const updated = await db.blockchainEvent.updateMany({
      where: { ...identity(event), finalityStatus: { not: 'FINALIZED' } },
      data: { ...blockData(event), finalityStatus: 'FINALIZED', finalizedAt, orphanedAt: null },
    });
    if (updated.count === 1) {
      return true;
    }
    // createMany + skipDuplicates dựa trên UNIQUE(chain_id, tx_hash, log_index): không lỗi khi trùng,
    // và không huỷ giao dịch đang mở như khi bắt lỗi P2002.
    const created = await db.blockchainEvent.createMany({
      data: [{ ...identity(event), ...blockData(event), finalityStatus: 'FINALIZED', finalizedAt }],
      skipDuplicates: true,
    });
    return created.count === 1;
  }

  async recordObserved(event: ChainEvent, scope: TransactionScope): Promise<void> {
    const db = prismaFrom(this.prisma, scope);
    // Giao dịch bị đưa sang block khác sau reorg: làm mới vị trí, quay lại PENDING.
    const updated = await db.blockchainEvent.updateMany({
      where: { ...identity(event), finalityStatus: { not: 'FINALIZED' } },
      data: { ...blockData(event), finalityStatus: 'PENDING', orphanedAt: null },
    });
    if (updated.count === 0) {
      await db.blockchainEvent.createMany({
        data: [{ ...identity(event), ...blockData(event), finalityStatus: 'PENDING' }],
        skipDuplicates: true,
      });
    }
  }

  async orphanPending(
    chainId: number,
    contractAddress: string,
    range: BlockRange,
    scope: TransactionScope,
  ): Promise<number> {
    const { count } = await prismaFrom(this.prisma, scope).blockchainEvent.updateMany({
      where: {
        chainId,
        contractAddress,
        finalityStatus: 'PENDING',
        blockNumber: { gte: range.from, lte: range.to },
      },
      data: { finalityStatus: 'ORPHANED', orphanedAt: this.clock.now() },
    });
    return count;
  }

  async correlationKeysAfter(
    chainId: number,
    contractAddress: string,
    block: bigint,
  ): Promise<string[]> {
    const rows = await this.prisma.blockchainEvent.findMany({
      where: {
        chainId,
        contractAddress,
        blockNumber: { gt: block },
        finalityStatus: { not: 'ORPHANED' },
        correlationKey: { not: null },
      },
      distinct: ['correlationKey'],
      select: { correlationKey: true },
    });
    return rows.flatMap((row) => (row.correlationKey ? [row.correlationKey] : []));
  }
}

function identity(event: ChainEvent) {
  return { chainId: event.chainId, txHash: event.txHash, logIndex: event.logIndex };
}

function blockData(event: ChainEvent) {
  return {
    contractAddress: event.contractAddress,
    blockNumber: event.blockNumber,
    blockHash: event.blockHash,
    blockTimestamp: event.blockTimestamp,
    txIndex: event.txIndex,
    eventName: event.eventName,
    correlationKey: event.correlationKey,
    actorAddress: event.actorAddress,
    payload: { contract: event.contractName, args: { ...event.args } },
  };
}
