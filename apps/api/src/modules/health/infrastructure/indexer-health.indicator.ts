import { Injectable } from '@nestjs/common';
import { ChainProviderService } from '../../../infrastructure/blockchain/chain-provider.service.js';
import { type ContractProgress, IndexerProgress } from '../../chain-sync/index.js';
import type { HealthIndicator } from '../application/health-indicator.port.js';
import { describeError } from '../application/health.service.js';
import type { ComponentHealth } from '../domain/health-report.js';
import { elapsedSince } from './database-health.indicator.js';

/** Chậm quá số block này thì báo `degraded` (Monad ~0,3 s/block, tức khoảng 30 giây). */
export const INDEXER_LAG_TOLERANCE_BLOCKS = 100;

/**
 * Indexer chạy trong Worker; API đọc tiến độ từ indexer_checkpoints rồi so với block finalized.
 * Indexer chậm không làm hệ thống `down`: dữ liệu vẫn đúng, chỉ cập nhật trễ.
 */
@Injectable()
export class IndexerHealthIndicator implements HealthIndicator {
  readonly key = 'indexer';

  constructor(
    private readonly progress: IndexerProgress,
    private readonly chain: ChainProviderService,
  ) {}

  async check(): Promise<ComponentHealth> {
    const startedAt = performance.now();
    const contracts = await this.progress.read();
    if (contracts.length === 0) {
      return { status: 'up', latencyMs: elapsedSince(startedAt), details: { trackedContracts: 0 } };
    }

    let finalizedBlock: number | null = null;
    let chainError: string | null = null;
    try {
      finalizedBlock = (await this.chain.readHead()).finalizedBlock;
    } catch (error) {
      chainError = describeError(error);
    }

    const synced = contracts.flatMap((contract) =>
      contract.checkpoint ? [contract.checkpoint] : [],
    );
    const lowest = synced.reduce<bigint | null>(
      (min, checkpoint) =>
        min === null || checkpoint.lastFinalizedBlock < min ? checkpoint.lastFinalizedBlock : min,
      null,
    );
    const oldestSync = synced.reduce<Date | null>(
      (min, checkpoint) =>
        min === null || checkpoint.updatedAt < min ? checkpoint.updatedAt : min,
      null,
    );
    const lagBlocks =
      finalizedBlock !== null && lowest !== null
        ? Math.max(0, finalizedBlock - Number(lowest))
        : null;
    const health: ComponentHealth = {
      status: 'up',
      latencyMs: elapsedSince(startedAt),
      details: {
        trackedContracts: contracts.length,
        indexedBlock: lowest === null ? null : Number(lowest),
        chainFinalizedBlock: finalizedBlock,
        lagBlocks,
        lastSyncedAt: oldestSync?.toISOString() ?? null,
      },
    };

    const error = describeProblem(contracts, chainError, lagBlocks);
    return error ? { ...health, status: 'degraded', error } : health;
  }
}

function describeProblem(
  contracts: readonly ContractProgress[],
  chainError: string | null,
  lagBlocks: number | null,
): string | null {
  const notStarted = contracts.filter((contract) => contract.checkpoint === null);
  if (notStarted.length > 0) {
    return `Worker chưa quét ${notStarted.map((contract) => contract.contractName).join(', ')}. Chạy Worker: pnpm dev (hoặc pnpm --filter @dpp/api dev:worker).`;
  }
  if (chainError) {
    return `Không đọc được block finalized để so tiến độ: ${chainError}`;
  }
  if (lagBlocks !== null && lagBlocks > INDEXER_LAG_TOLERANCE_BLOCKS) {
    return `Indexer chậm ${lagBlocks} block so với chain: đang bắt kịp, hoặc Worker đã dừng.`;
  }
  return null;
}
