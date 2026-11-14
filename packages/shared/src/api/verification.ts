import type { AuthStatus, ProductState, WarrantyState } from '../domain/enums.js';
import type { PartyLabel } from './products.js';

/**
 * (M11) Các mục hộ chiếu công khai đối chiếu với contract:
 * - PROFILE: hash hồ sơ và nhà phát hành (ProductPassport);
 * - ISSUER: doanh nghiệp phát hành còn được duyệt (PartyRegistry);
 * - STATE: trạng thái sản phẩm;
 * - CUSTODY: bên giữ hàng và nhà bán lẻ đang được giao tới;
 * - OWNER: chủ sở hữu (chỉ so khớp, không trả danh tính);
 * - WARRANTY: ngày kích hoạt, hạn và tạm dừng bảo hành (WarrantyManager).
 */
export const VERIFICATION_CHECKS = [
  'PROFILE',
  'ISSUER',
  'STATE',
  'CUSTODY',
  'OWNER',
  'WARRANTY',
] as const;

export type VerificationCheckKey = (typeof VERIFICATION_CHECKS)[number];

/**
 * - MATCH: dữ liệu hệ thống khớp contract;
 * - MISMATCH: khác contract (trang tin theo blockchain, Admin nhận cảnh báo);
 * - SYNCING: có giao dịch mới hơn mốc Indexer đã chốt, chưa so được;
 * - UNAVAILABLE: chưa đọc được blockchain (RPC lỗi, chưa cấu hình, Indexer chưa quét).
 */
export const VERIFICATION_STATUSES = ['MATCH', 'MISMATCH', 'SYNCING', 'UNAVAILABLE'] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export interface VerificationCheck {
  key: VerificationCheckKey;
  status: VerificationStatus;
}

/** Giá trị đọc từ contract tại block đối chiếu; người dùng cá nhân chỉ hiện là "cá nhân". */
export interface OnchainSnapshot {
  metadataHash: string | null;
  issuerPartyId: string | null;
  issuerStatus: AuthStatus | null;
  productState: ProductState | null;
  holder: PartyLabel | null;
  pendingRetailer: { name: string; partyId: string } | null;
  hasOwner: boolean;
  /** Trạng thái bảo hành tính theo giờ hiện tại từ dữ liệu WarrantyManager. */
  warrantyState: WarrantyState | null;
  warrantyExpiresAt: string | null;
}

/** Địa chỉ contract để người xem tự đối chiếu (trình duyệt đọc thẳng blockchain, mở explorer). */
export interface VerificationContracts {
  chainId: number;
  productPassport: string;
  partyRegistry: string;
  warrantyManager: string | null;
  serviceTicketManager: string | null;
  inspectionRegistry: string | null;
  ownershipTransfer: string | null;
  productLifecycle: string | null;
}

/** `GET /public/products/:code/verification`. */
export interface PublicVerificationView {
  /** MISMATCH nếu có mục lệch; SYNCING hoặc UNAVAILABLE nếu có mục chưa so được; còn lại MATCH. */
  status: VerificationStatus;
  checks: VerificationCheck[];
  onchain: OnchainSnapshot | null;
  /** Block đã đọc contract (mốc Indexer đã chốt), dạng chuỗi thập phân. */
  atBlock: string | null;
  /** Lúc Indexer chốt tới mốc đó. */
  indexedAt: string | null;
  checkedAt: string;
  /** `null` khi hệ thống chưa cấu hình ProductPassport hoặc PartyRegistry. */
  contracts: VerificationContracts | null;
}
