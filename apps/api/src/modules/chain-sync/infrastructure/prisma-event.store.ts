import { Injectable } from '@nestjs/common';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import { prismaFrom } from '../../../infrastructure/database/prisma-scope.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { EventStore } from '../application/event-store.port.js';
import type { ChainEvent } from '../domain/chain-event.js';

@Injectable()
export class PrismaEventStore implements EventStore {
  constructor(private readonly prisma: PrismaService) {}

  async recordFinalized(event: ChainEvent, scope: TransactionScope): Promise<boolean> {
    // createMany + skipDuplicates dựa trên UNIQUE(chain_id, tx_hash, log_index): không lỗi khi trùng,
    // và không huỷ giao dịch đang mở như khi bắt lỗi P2002.
    const { count } = await prismaFrom(this.prisma, scope).blockchainEvent.createMany({
      data: [
        {
          chainId: event.chainId,
          contractAddress: event.contractAddress,
          blockNumber: event.blockNumber,
          blockHash: event.blockHash,
          blockTimestamp: event.blockTimestamp,
          txHash: event.txHash,
          txIndex: event.txIndex,
          logIndex: event.logIndex,
          eventName: event.eventName,
          correlationKey: event.correlationKey,
          actorAddress: event.actorAddress,
          payload: { contract: event.contractName, args: { ...event.args } },
          finalityStatus: 'FINALIZED',
          finalizedAt: new Date(),
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }
}
