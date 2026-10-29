import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import type { BlockRange } from '../domain/block-range.js';
import type { ChainEvent } from '../domain/chain-event.js';

/**
 * Bảng blockchain_events [R], khoá (chain, tx, logIndex).
 * Cả Indexer lẫn luồng chốt giao dịch đều ghi qua `finalize`, nên mỗi event chỉ được chiếu một lần.
 */
export interface EventStore {
  /**
   * Chuyển event sang FINALIZED (tạo mới nếu chưa có, cập nhật block nếu đang PENDING/ORPHANED).
   * Trả id dòng blockchain_events khi lần gọi này là lần chốt đầu tiên (người gọi chạy projector
   * trong cùng giao dịch), `null` nếu event đã được chốt trước đó.
   */
  finalize(event: ChainEvent, scope: TransactionScope): Promise<string | null>;
  /** Ghi event PENDING từ block chưa finalized; không đụng tới event đã FINALIZED. */
  recordObserved(event: ChainEvent, scope: TransactionScope): Promise<void>;
  /** Event PENDING còn lại trong đoạn đã chốt không còn trên chain chính: đánh dấu ORPHANED. */
  orphanPending(
    chainId: number,
    contractAddress: string,
    range: BlockRange,
    scope: TransactionScope,
  ): Promise<number>;
  /** correlation_key của các event (PENDING hoặc FINALIZED) nằm sau `block`. */
  correlationKeysAfter(chainId: number, contractAddress: string, block: bigint): Promise<string[]>;
}

export const EVENT_STORE = Symbol('EVENT_STORE');
