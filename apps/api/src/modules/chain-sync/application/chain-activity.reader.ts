import type { TransactionMethodStats } from '@dpp/shared';

export type TransactionStatusCounts = Record<
  'QUEUED' | 'SUBMITTED' | 'CONFIRMED' | 'REVERTED' | 'FAILED',
  number
>;

/** Giao dịch web đã báo mà chưa chốt (luật TRANSACTION_STUCK). */
export interface StuckTransaction {
  txHash: string;
  fromAddress: string;
  contractName: string;
  method: string;
  submittedAt: Date;
  initiatedByUserId: string | null;
}

/** Ví có nhiều giao dịch revert trong một khoảng (luật WALLET_REPEATED_REVERTS). */
export interface RevertBurst {
  fromAddress: string;
  reverts: number;
}

/**
 * (M12) Số liệu giao dịch và event cho dashboard Admin (AUD-02) và luật chạy nền (AUD-03).
 * Đọc chain_transactions (giao dịch web báo) và blockchain_events (event đã chốt).
 */
export interface ChainActivity {
  transactions(
    since: Date,
  ): Promise<{ byStatus: TransactionStatusCounts; methods: TransactionMethodStats[] }>;
  /** Số event FINALIZED mỗi ngày theo `timeZone`, từ `since`. */
  dailyEvents(since: Date, timeZone: string): Promise<{ day: string; events: number }[]>;
  stuckTransactions(submittedBefore: Date): Promise<StuckTransaction[]>;
  revertBursts(since: Date, minReverts: number): Promise<RevertBurst[]>;
}

export const CHAIN_ACTIVITY = Symbol('CHAIN_ACTIVITY');
