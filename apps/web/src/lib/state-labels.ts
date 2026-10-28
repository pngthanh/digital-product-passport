import type {
  ProductState,
  ServiceState,
  TransferState,
  WalletStatus,
  WarrantyState,
} from '@dpp/shared';

export type Tone = 'neutral' | 'ocean' | 'ok' | 'warn' | 'bad';

export interface StateLabel {
  label: string;
  tone: Tone;
}

/** Nhãn hiển thị tiếng Việt cho 4 state machine; giá trị lưu trữ vẫn là mã tiếng Anh. */
export const PRODUCT_STATE_LABELS: Record<ProductState, StateLabel> = {
  CREATED: { label: 'Mới phát hành', tone: 'neutral' },
  IN_DISTRIBUTION: { label: 'Đang vận chuyển', tone: 'ocean' },
  AT_RETAIL: { label: 'Tại cửa hàng', tone: 'ocean' },
  SOLD: { label: 'Đã có chủ', tone: 'ok' },
  RECALLED: { label: 'Bị thu hồi', tone: 'bad' },
  LOST_STOLEN: { label: 'Báo mất cắp', tone: 'bad' },
  RETIRED: { label: 'Ngừng sử dụng', tone: 'neutral' },
};

export const WARRANTY_STATE_LABELS: Record<WarrantyState, StateLabel> = {
  ACTIVE: { label: 'Còn bảo hành', tone: 'ok' },
  SUSPENDED: { label: 'Tạm dừng khi sửa', tone: 'warn' },
  EXPIRED: { label: 'Hết bảo hành', tone: 'neutral' },
};

export const SERVICE_STATE_LABELS: Record<ServiceState, StateLabel> = {
  REQUESTED: { label: 'Đã gửi yêu cầu', tone: 'neutral' },
  IN_REPAIR: { label: 'Đang sửa', tone: 'warn' },
  REPAIRED: { label: 'Đã sửa xong', tone: 'ok' },
  REJECTED: { label: 'Không sửa được', tone: 'bad' },
  CANCELLED: { label: 'Đã huỷ', tone: 'neutral' },
};

export const TRANSFER_STATE_LABELS: Record<TransferState, StateLabel> = {
  REQUESTED: { label: 'Chờ bên nhận', tone: 'ocean' },
  COMPLETED: { label: 'Đã chuyển quyền', tone: 'ok' },
  REJECTED: { label: 'Bên nhận từ chối', tone: 'bad' },
  CANCELLED: { label: 'Chủ đã huỷ', tone: 'neutral' },
  EXPIRED: { label: 'Hết hạn', tone: 'neutral' },
};

export const WALLET_STATUS_LABELS: Record<WalletStatus, StateLabel> = {
  PENDING: { label: 'Chờ xác nhận on-chain', tone: 'warn' },
  ACTIVE: { label: 'Đang dùng', tone: 'ok' },
  ROTATED: { label: 'Đã thay', tone: 'neutral' },
  REVOKED: { label: 'Đã thu hồi', tone: 'bad' },
};
