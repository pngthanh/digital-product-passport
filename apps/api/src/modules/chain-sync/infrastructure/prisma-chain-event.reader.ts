import { Injectable } from '@nestjs/common';
import type { BlockchainEvent, Prisma } from '../../../infrastructure/database/generated/client.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { ChainEventReader } from '../application/chain-event-history.query.js';
import type { ChainEventArg, RecordedChainEvent } from '../domain/chain-event.js';

const ORDER = [{ blockNumber: 'asc' as const }, { logIndex: 'asc' as const }];

function isJsonObject(value: Prisma.JsonValue | undefined): value is Prisma.JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** payload lưu `{ contract, args }`; chỉ lấy tham số dạng chuỗi, số, boolean như lúc ghi. */
function argsOf(payload: Prisma.JsonValue): Record<string, ChainEventArg> {
  const args = isJsonObject(payload) ? payload.args : undefined;
  if (!isJsonObject(args)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(args).flatMap(([name, value]) =>
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? [[name, value]]
        : [],
    ),
  );
}

function toRecorded(row: BlockchainEvent): RecordedChainEvent {
  return {
    eventName: row.eventName,
    txHash: row.txHash,
    blockNumber: row.blockNumber,
    logIndex: row.logIndex,
    blockTimestamp: row.blockTimestamp,
    actorAddress: row.actorAddress,
    args: argsOf(row.payload),
  };
}

@Injectable()
export class PrismaChainEventReader implements ChainEventReader {
  constructor(private readonly prisma: PrismaService) {}

  async byCorrelation(
    chainId: number,
    contractAddress: string,
    correlationKey: string,
  ): Promise<RecordedChainEvent[]> {
    const rows = await this.prisma.blockchainEvent.findMany({
      where: { chainId, contractAddress, correlationKey, finalityStatus: 'FINALIZED' },
      orderBy: ORDER,
    });
    return rows.map(toRecorded);
  }

  async byProduct(
    chainId: number,
    chainProductIds: readonly string[],
  ): Promise<RecordedChainEvent[]> {
    const rows = await this.prisma.blockchainEvent.findMany({
      where: { chainId, chainProductId: { in: [...chainProductIds] }, finalityStatus: 'FINALIZED' },
      orderBy: ORDER,
    });
    return rows.map(toRecorded);
  }
}
