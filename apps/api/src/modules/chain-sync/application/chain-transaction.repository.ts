import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import type { TrackedTxStatus } from '../domain/transaction-confirmation.js';

export interface SubmittedTransaction {
  chainId: number;
  txHash: string;
  fromAddress: string;
  toAddress: string;
  contractName: string;
  method: string;
  nonce: number;
  gasLimit: bigint;
  maxFeePerGas: bigint | null;
  maxPriorityFeePerGas: bigint | null;
  valueWei: bigint;
  initiatedByUserId: string | null;
  submittedAt: Date;
}

export interface AwaitingTransaction {
  id: string;
  txHash: string;
  submittedAt: Date;
}

export interface FinalTransactionResult {
  status: 'CONFIRMED' | 'REVERTED';
  blockNumber: bigint;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  confirmedAt: Date;
}

/** Bảng chain_transactions: theo dõi giao dịch ví người dùng gửi, làm số liệu gas cho benchmark. */
export interface ChainTransactionRepository {
  statusOf(txHash: string): Promise<TrackedTxStatus | null>;
  /** Bỏ qua nếu tx_hash đã được theo dõi (người dùng bấm gửi lại). */
  insertSubmitted(transaction: SubmittedTransaction): Promise<void>;
  listAwaiting(limit: number): Promise<AwaitingTransaction[]>;
  markFinal(id: string, result: FinalTransactionResult, scope: TransactionScope): Promise<void>;
  markDropped(id: string, reason: string): Promise<void>;
}

export const CHAIN_TRANSACTION_REPOSITORY = Symbol('CHAIN_TRANSACTION_REPOSITORY');
