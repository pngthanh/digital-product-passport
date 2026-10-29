import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import type { IndexerCheckpoint } from '../domain/indexer-checkpoint.js';

export interface StoredCheckpoint extends IndexerCheckpoint {
  readonly updatedAt: Date;
}

/** Bảng indexer_checkpoints [R]. */
export interface IndexerCheckpointRepository {
  find(chainId: number, contractAddress: string): Promise<StoredCheckpoint | null>;
  save(checkpoint: IndexerCheckpoint, scope?: TransactionScope): Promise<void>;
}

export const INDEXER_CHECKPOINT_REPOSITORY = Symbol('INDEXER_CHECKPOINT_REPOSITORY');
