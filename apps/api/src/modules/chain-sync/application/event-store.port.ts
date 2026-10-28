import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import type { ChainEvent } from '../domain/chain-event.js';

/** Bảng blockchain_events [R]. */
export interface EventStore {
  /** Ghi event FINALIZED; trả `false` nếu (chain, tx, logIndex) đã có, tức đã được chiếu trước đó. */
  recordFinalized(event: ChainEvent, scope: TransactionScope): Promise<boolean>;
}

export const EVENT_STORE = Symbol('EVENT_STORE');
