import type { ContractProgress } from '../../chain-sync/index.js';
import type { ChainHeadReader } from './ports/chain-head.reader.js';

export interface IndexerLag {
  /** Mốc thấp nhất trong các contract đang quét; `null` khi Worker chưa quét. */
  indexedBlock: bigint | null;
  finalizedBlock: bigint | null;
  behindBlocks: bigint | null;
  /** Lần Indexer ghi mốc gần nhất (của contract chậm nhất). */
  lastIndexedAt: Date | null;
  /** Thời gian của block đã chiếu và block finalized, khi đọc được. */
  indexedBlockTime: Date | null;
  finalizedBlockTime: Date | null;
}

/** Độ trễ của Indexer so với block finalized; lỗi RPC thì các trường của chain là `null`. */
export async function measureIndexerLag(
  progress: readonly ContractProgress[],
  head: ChainHeadReader,
  withBlockTimes: boolean,
): Promise<IndexerLag> {
  const checkpoints = progress.flatMap((contract) =>
    contract.checkpoint ? [contract.checkpoint] : [],
  );
  const lowest = checkpoints.reduce<(typeof checkpoints)[number] | null>(
    (min, checkpoint) =>
      min === null || checkpoint.lastFinalizedBlock < min.lastFinalizedBlock ? checkpoint : min,
    null,
  );
  let finalized: { number: bigint; time: Date } | null = null;
  let indexedBlockTime: Date | null = null;
  try {
    finalized = await head.finalizedBlock();
    if (withBlockTimes && lowest) {
      indexedBlockTime = await head.blockTime(lowest.lastFinalizedBlock);
    }
  } catch {
    finalized = null;
  }
  const behind =
    finalized && lowest
      ? finalized.number > lowest.lastFinalizedBlock
        ? finalized.number - lowest.lastFinalizedBlock
        : 0n
      : null;
  return {
    indexedBlock: lowest?.lastFinalizedBlock ?? null,
    finalizedBlock: finalized?.number ?? null,
    behindBlocks: behind,
    lastIndexedAt: lowest?.updatedAt ?? null,
    indexedBlockTime,
    finalizedBlockTime: finalized?.time ?? null,
  };
}
