// Public API của module chain-sync — module khác chỉ import từ đây.
export { ChainSyncModule } from './chain-sync.module.js';
export { ChainSyncWorkerModule } from './chain-sync-worker.module.js';
export {
  TRANSACTION_TRACKING,
  type TrackTransactionInput,
  type TransactionTracking,
} from './application/transaction-tracker.service.js';
export { EventProjectorRegistry, type EventProjector } from './application/event-projector.js';
export { ConfirmTransactions } from './application/confirm-transactions.use-case.js';
export type { ChainEvent, ChainEventArg } from './domain/chain-event.js';
export type { TrackedTxStatus } from './domain/transaction-confirmation.js';
