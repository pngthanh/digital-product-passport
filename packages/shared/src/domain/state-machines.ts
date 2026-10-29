import { AuthStatus, ProductState, ServiceState, TransferState, WarrantyState } from './enums.js';

/** Bảng chuyển trạng thái: khoá là trạng thái hiện tại, giá trị là các trạng thái kế tiếp hợp lệ. */
export type TransitionTable<S extends string> = Readonly<Record<S, readonly S[]>>;

/**
 * Product State. RECALLED, LOST_STOLEN, RETIRED là trạng thái cuối.
 * IN_DISTRIBUTION → CREATED khi nhà sản xuất huỷ gửi hoặc nhà bán lẻ từ chối nhận (M6).
 * Chuyển ra khỏi LOST_STOLEN/RETIRED còn chờ nhóm chốt (quyết định D8).
 */
export const PRODUCT_STATE_TRANSITIONS: TransitionTable<ProductState> = {
  [ProductState.CREATED]: [ProductState.IN_DISTRIBUTION, ProductState.RECALLED],
  [ProductState.IN_DISTRIBUTION]: [
    ProductState.AT_RETAIL,
    ProductState.CREATED,
    ProductState.RECALLED,
  ],
  [ProductState.AT_RETAIL]: [ProductState.SOLD, ProductState.RECALLED],
  [ProductState.SOLD]: [ProductState.RECALLED, ProductState.LOST_STOLEN, ProductState.RETIRED],
  [ProductState.RECALLED]: [],
  [ProductState.LOST_STOLEN]: [],
  [ProductState.RETIRED]: [],
};

/** Warranty State. EXPIRED đạt được theo thời gian, kể cả khi đang SUSPENDED. */
export const WARRANTY_STATE_TRANSITIONS: TransitionTable<WarrantyState> = {
  [WarrantyState.ACTIVE]: [WarrantyState.SUSPENDED, WarrantyState.EXPIRED],
  [WarrantyState.SUSPENDED]: [WarrantyState.ACTIVE, WarrantyState.EXPIRED],
  [WarrantyState.EXPIRED]: [],
};

/** Service State của một phiếu dịch vụ. REQUESTED và CANCELLED chỉ tồn tại off-chain. */
export const SERVICE_STATE_TRANSITIONS: TransitionTable<ServiceState> = {
  [ServiceState.REQUESTED]: [ServiceState.IN_REPAIR, ServiceState.CANCELLED],
  [ServiceState.IN_REPAIR]: [ServiceState.REPAIRED, ServiceState.REJECTED],
  [ServiceState.REPAIRED]: [],
  [ServiceState.REJECTED]: [],
  [ServiceState.CANCELLED]: [],
};

/** Transfer State của một yêu cầu chuyển quyền. acceptTransfer là giao dịch nguyên tử. */
export const TRANSFER_STATE_TRANSITIONS: TransitionTable<TransferState> = {
  [TransferState.REQUESTED]: [
    TransferState.COMPLETED,
    TransferState.REJECTED,
    TransferState.CANCELLED,
    TransferState.EXPIRED,
  ],
  [TransferState.COMPLETED]: [],
  [TransferState.REJECTED]: [],
  [TransferState.CANCELLED]: [],
  [TransferState.EXPIRED]: [],
};

/** Trạng thái phê duyệt tổ chức. Đơn bị từ chối được sửa và nộp lại (D27). */
export const AUTH_STATUS_TRANSITIONS: TransitionTable<AuthStatus> = {
  [AuthStatus.PENDING]: [AuthStatus.AUTHORIZED, AuthStatus.REJECTED],
  [AuthStatus.AUTHORIZED]: [AuthStatus.DISABLED],
  [AuthStatus.REJECTED]: [AuthStatus.PENDING],
  [AuthStatus.DISABLED]: [],
};

/** Kiểm tra một bước chuyển có hợp lệ theo bảng chuyển trạng thái hay không. */
export function canTransition<S extends string>(
  table: TransitionTable<S>,
  from: S,
  to: S,
): boolean {
  return table[from].includes(to);
}

/** Trạng thái cuối là trạng thái không còn bước chuyển nào. */
export function isTerminalState<S extends string>(table: TransitionTable<S>, state: S): boolean {
  return table[state].length === 0;
}
