import type { TransferFilter, TransferState } from '@dpp/shared';
import type { TransactionScope } from '../../../../common/persistence/transaction-scope.js';
import type { TransferRequestRecord } from '../../domain/transfer-request.js';

export interface NewTransferRequest {
  chainRequestId: bigint;
  productId: string;
  fromPartyId: string;
  toPartyId: string;
  requestedAt: Date;
  expiresAt: Date;
  createdTxHash: string;
}

export interface TransferListQuery {
  partyIds: readonly string[];
  filter: TransferFilter;
  page: number;
  pageSize: number;
}

/** Bảng transfer_requests: chỉ Worker ghi (chiếu event), API chỉ đọc. */
export interface TransferRequestRepository {
  /** `false` nếu requestId đã có (chiếu lại cùng event). */
  create(request: NewTransferRequest, scope: TransactionScope): Promise<boolean>;
  findByChainId(
    chainRequestId: bigint,
    scope?: TransactionScope,
  ): Promise<TransferRequestRecord | null>;
  /** REQUESTED thành `state`; trả dòng đã đóng, `null` nếu không có yêu cầu đang mở với mã này. */
  close(
    chainRequestId: bigint,
    state: Exclude<TransferState, 'REQUESTED'>,
    closure: { at: Date; txHash: string },
    scope: TransactionScope,
  ): Promise<TransferRequestRecord | null>;
  /** Yêu cầu REQUESTED của sản phẩm (có thể đã quá hạn). */
  openForProduct(productId: string): Promise<TransferRequestRecord | null>;
  /** Yêu cầu đã đóng của sản phẩm do một trong các Party gửi, mới nhất trước. */
  closedSentBy(productId: string, partyIds: readonly string[]): Promise<TransferRequestRecord[]>;
  listForParties(
    query: TransferListQuery,
  ): Promise<{ items: TransferRequestRecord[]; total: number }>;
  countsForParties(partyIds: readonly string[]): Promise<Record<TransferFilter, number>>;
}

export const TRANSFER_REQUEST_REPOSITORY = Symbol('TRANSFER_REQUEST_REPOSITORY');
