import type {
  AuthStatus,
  OnchainSnapshot,
  VerificationCheckKey,
  VerificationStatus,
} from '@dpp/shared';
import { formatDate } from '@/lib/format';
import { PRODUCT_STATE_LABELS, type Tone, WARRANTY_STATE_LABELS } from '@/lib/state-labels';
import { partyText } from '../products/product-status';

export const CHECK_LABELS: Record<VerificationCheckKey, string> = {
  PROFILE: 'Hồ sơ và nhà phát hành',
  ISSUER: 'Doanh nghiệp phát hành',
  STATE: 'Trạng thái sản phẩm',
  CUSTODY: 'Bên đang giữ hàng',
  OWNER: 'Chủ sở hữu',
  WARRANTY: 'Bảo hành',
};

export const STATUS_SUMMARY: Record<
  VerificationStatus,
  { title: string; body: string; tone: Tone }
> = {
  MATCH: {
    title: 'Khớp blockchain',
    body: 'Mọi mục trên trang trùng với dữ liệu contract tại block hệ thống đã chốt.',
    tone: 'ok',
  },
  MISMATCH: {
    title: 'Có mục khác blockchain',
    body: 'Hãy tin theo giá trị trên blockchain ghi bên dưới. Quản trị viên đã được báo để kiểm tra.',
    tone: 'bad',
  },
  SYNCING: {
    title: 'Đang cập nhật',
    body: 'Sản phẩm vừa có giao dịch mới, hệ thống chưa ghi nhận xong nên chưa so được. Tải lại sau ít giây.',
    tone: 'neutral',
  },
  UNAVAILABLE: {
    title: 'Chưa đối chiếu được',
    body: 'Lúc này máy chủ chưa đọc được blockchain. Bạn vẫn có thể tự kiểm tra bằng trình duyệt bên dưới.',
    tone: 'warn',
  },
};

const ISSUER_STATUS_TEXT: Record<AuthStatus, string> = {
  PENDING: 'đang chờ duyệt',
  AUTHORIZED: 'đã được duyệt',
  REJECTED: 'bị từ chối',
  DISABLED: 'đã bị khoá',
};

/** Giá trị trên blockchain của một mục bị lệch (không có danh tính người dùng cá nhân). */
export function onchainValue(key: VerificationCheckKey, onchain: OnchainSnapshot): string {
  switch (key) {
    case 'PROFILE':
      return onchain.productState === null
        ? 'không có sản phẩm này trên ProductPassport'
        : 'hash hồ sơ hoặc nhà phát hành khác trang này';
    case 'ISSUER':
      return onchain.issuerStatus
        ? `doanh nghiệp ${ISSUER_STATUS_TEXT[onchain.issuerStatus]}`
        : 'không có doanh nghiệp này';
    case 'STATE':
      return onchain.productState
        ? PRODUCT_STATE_LABELS[onchain.productState].label
        : 'chưa đăng ký';
    case 'CUSTODY':
      return onchain.pendingRetailer
        ? `${partyText(onchain.holder)}, đang gửi tới ${onchain.pendingRetailer.name}`
        : `${partyText(onchain.holder)}, không có lô hàng đang gửi`;
    case 'OWNER':
      return onchain.hasOwner ? 'đã có chủ' : 'chưa có chủ';
    case 'WARRANTY':
      return onchain.warrantyState && onchain.warrantyExpiresAt
        ? `${WARRANTY_STATE_LABELS[onchain.warrantyState].label}, đến ${formatDate(onchain.warrantyExpiresAt)}`
        : 'chưa kích hoạt';
  }
}
