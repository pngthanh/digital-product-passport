import type { FeeAction, FeePaymentSummary } from '@dpp/shared';
import type { TransactionScope } from '../../../../common/persistence/transaction-scope.js';

export interface FeePolicyRecord {
  action: FeeAction;
  amountWei: bigint;
  treasury: string;
}

export interface FeePaymentRecord extends Omit<FeePaymentSummary, 'amountWei' | 'paidAt'> {
  partyId: string;
  amountWei: bigint;
  paidAt: Date;
}

export interface PaidFee {
  partyId: string;
  action: FeeAction;
  payerAddress: string;
  amountWei: bigint;
  txHash: string;
  paidAt: Date;
}

/** Bảng fee_payments và fee_policies (dữ liệu [P], chỉ Indexer ghi). */
export interface FeeLedgerRepository {
  findPolicy(action: FeeAction): Promise<FeePolicyRecord | null>;
  /** Mới nhất trước, theo từng Party. */
  paymentsOf(partyIds: readonly string[]): Promise<Map<string, FeePaymentRecord[]>>;
  recordPaid(fee: PaidFee, scope: TransactionScope): Promise<void>;
  settle(partyId: string, txHash: string, at: Date, scope: TransactionScope): Promise<void>;
  markRefundable(partyId: string, scope: TransactionScope): Promise<void>;
  markRefunded(partyId: string, txHash: string, at: Date, scope: TransactionScope): Promise<void>;
  upsertPolicy(policy: FeePolicyRecord, txHash: string, scope: TransactionScope): Promise<void>;
  updateTreasury(treasury: string, txHash: string, scope: TransactionScope): Promise<void>;
}

export const FEE_LEDGER_REPOSITORY = Symbol('FEE_LEDGER_REPOSITORY');
