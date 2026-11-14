import type { TransactionScope } from '../../../../common/persistence/transaction-scope.js';
import type { RecallRecord } from '../../domain/recall.js';

export interface PendingRecall {
  productId: string;
  issuerOrgId: string;
  reason: string;
  reasonHash: string;
}

/** Bảng recalls (một dòng mỗi sản phẩm). */
export interface RecallRepository {
  /**
   * Ghi lý do chờ ký cho từng sản phẩm; dòng PENDING cũ (lần trước chưa ký) được thay. Dòng đã
   * CONFIRMED không bị đụng tới.
   */
  savePending(recalls: readonly PendingRecall[]): Promise<void>;
  findByProduct(productId: string, scope?: TransactionScope): Promise<RecallRecord | null>;
  /** Chốt khi ProductRecalled finalized; `false` nếu không có dòng khớp hash lý do. */
  confirm(
    productId: string,
    reasonHash: string,
    chain: { txHash: string; at: Date },
    scope: TransactionScope,
  ): Promise<boolean>;
  /** Thu hồi on-chain mà hệ thống không có lý do khớp hash: lưu để vẫn hiện được thu hồi. */
  confirmWithoutReason(
    recall: { productId: string; issuerOrgId: string; reasonHash: string; reason: string },
    chain: { txHash: string; at: Date },
    scope: TransactionScope,
  ): Promise<void>;
}

export const RECALL_REPOSITORY = Symbol('RECALL_REPOSITORY');
