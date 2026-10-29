/**
 * Mốc đồng bộ của Indexer cho một contract (bảng indexer_checkpoints).
 * Mọi log tới `lastFinalizedBlock` đã ghi FINALIZED; phần trên đó tới `lastObservedBlock` là PENDING.
 */
export interface IndexerCheckpoint {
  readonly chainId: number;
  readonly contractAddress: string;
  readonly lastObservedBlock: bigint;
  readonly lastFinalizedBlock: bigint;
  readonly lastFinalizedBlockHash: string;
}

/** Contract cần quét log và block bắt đầu (block lúc deploy); `null` là bắt đầu từ block finalized hiện tại. */
export interface IndexedContract {
  readonly name: string;
  readonly address: string;
  readonly startBlock: bigint | null;
}

/** Mốc đầu tiên: đứng ngay trước block bắt đầu để lần quét đầu lấy cả block đó. */
export function initialCheckpoint(
  chainId: number,
  contractAddress: string,
  anchor: { number: bigint; hash: string },
): IndexerCheckpoint {
  return {
    chainId,
    contractAddress,
    lastObservedBlock: anchor.number,
    lastFinalizedBlock: anchor.number,
    lastFinalizedBlockHash: anchor.hash,
  };
}

/** Đã chốt xong tới `block`; phần đã quan sát không bao giờ lùi sau phần đã chốt. */
export function advanceFinalized(
  checkpoint: IndexerCheckpoint,
  block: { number: bigint; hash: string },
): IndexerCheckpoint {
  return {
    ...checkpoint,
    lastFinalizedBlock: block.number,
    lastFinalizedBlockHash: block.hash,
    lastObservedBlock:
      checkpoint.lastObservedBlock > block.number ? checkpoint.lastObservedBlock : block.number,
  };
}

export function advanceObserved(checkpoint: IndexerCheckpoint, block: bigint): IndexerCheckpoint {
  return block > checkpoint.lastObservedBlock
    ? { ...checkpoint, lastObservedBlock: block }
    : checkpoint;
}
