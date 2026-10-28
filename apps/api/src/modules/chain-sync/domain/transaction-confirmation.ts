/** Giao dịch không xuất hiện trong block sau khoảng này được coi là bị bỏ (ví huỷ, nonce bị thay). */
export const TX_DROP_TIMEOUT_MS = 10 * 60_000;

export type TrackedTxStatus = 'SUBMITTED' | 'CONFIRMED' | 'REVERTED' | 'FAILED';

export interface ReceiptOutcome {
  succeeded: boolean;
  blockNumber: bigint;
}

export type ConfirmationDecision =
  { kind: 'wait' } | { kind: 'drop' } | { kind: 'finalize'; status: 'CONFIRMED' | 'REVERTED' };

/**
 * Chỉ chốt kết quả khi block chứa giao dịch đã finalized (Monad: sau 2 block, không reorg),
 * nên dữ liệu chiếu sang CSDL không bao giờ phải hoàn tác.
 */
export function decideConfirmation(input: {
  receipt: ReceiptOutcome | null;
  finalizedBlock: bigint | null;
  submittedAt: Date;
  now: Date;
}): ConfirmationDecision {
  const { receipt, finalizedBlock, submittedAt, now } = input;
  if (!receipt) {
    return now.getTime() - submittedAt.getTime() > TX_DROP_TIMEOUT_MS
      ? { kind: 'drop' }
      : { kind: 'wait' };
  }
  if (finalizedBlock === null || receipt.blockNumber > finalizedBlock) {
    return { kind: 'wait' };
  }
  return { kind: 'finalize', status: receipt.succeeded ? 'CONFIRMED' : 'REVERTED' };
}
