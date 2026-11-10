import type { TransferState } from '@dpp/shared';

/** Dòng transfer_requests: chiếu từ event OwnershipTransfer, không có bản nháp off-chain. */
export interface TransferRequestRecord {
  id: string;
  /** requestId on-chain (bắt đầu từ 1). */
  chainRequestId: bigint;
  productId: string;
  fromPartyId: string;
  toPartyId: string;
  transferState: TransferState;
  requestedAt: Date;
  expiresAt: Date;
  closedAt: Date | null;
  createdTxHash: string;
  closedTxHash: string | null;
}

/** Còn REQUESTED nhưng đã quá hạn: contract không cho chấp nhận nữa, ai cũng đóng được. */
export function isExpired(
  request: Pick<TransferRequestRecord, 'transferState' | 'expiresAt'>,
  now: Date,
) {
  return request.transferState === 'REQUESTED' && request.expiresAt.getTime() < now.getTime();
}

/** Yêu cầu còn chấp nhận được: REQUESTED và chưa quá hạn. */
export function isPending(
  request: Pick<TransferRequestRecord, 'transferState' | 'expiresAt'>,
  now: Date,
) {
  return request.transferState === 'REQUESTED' && !isExpired(request, now);
}

/** Mã số thuế 10 số, hoặc 13 ký tự kiểu 0123456789-001 (chi nhánh). */
const TAX_CODE_PATTERN = /^\d{10}(-\d{3})?$/;

export function isTaxCode(value: string): boolean {
  return TAX_CODE_PATTERN.test(value);
}
