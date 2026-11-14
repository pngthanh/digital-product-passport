/** Block finalized của chain và thời điểm của một block (để đo độ trễ Indexer theo thời gian). */
export interface ChainHeadReader {
  /** `null` khi RPC không trả được block finalized. */
  finalizedBlock(): Promise<{ number: bigint; time: Date } | null>;
  blockTime(blockNumber: bigint): Promise<Date | null>;
}

export const CHAIN_HEAD_READER = Symbol('CHAIN_HEAD_READER');
