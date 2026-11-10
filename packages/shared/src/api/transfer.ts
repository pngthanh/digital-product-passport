/*
 * Hợp đồng dữ liệu của module Transfer (M9: chuyển nhượng quyền sở hữu), dùng chung cho API và Web.
 */

import type { TransferState } from '../domain/enums.js';
import type { ContractInfo } from './organizations.js';
import type { OrganizationLabel } from './products.js';

/**
 * Một bên của yêu cầu chuyển nhượng như người trong cuộc thấy: cá nhân hiện họ tên và email đã che
 * bớt, tổ chức hiện tên và mã số thuế. Hộ chiếu công khai không dùng kiểu này.
 */
export type TransferParty =
  | { kind: 'PERSON'; fullName: string; maskedEmail: string; isYou: boolean }
  | {
      kind: 'ORGANIZATION';
      organizationId: string;
      name: string;
      taxCode: string;
      isYou: boolean;
    };

/** `POST /me/owned-products/:id/transfer-recipients`: tra bên nhận trước khi tạo yêu cầu. */
export interface TransferRecipientInput {
  /** Email tài khoản cá nhân, hoặc mã số thuế của doanh nghiệp đã duyệt. */
  recipient: string;
}

export interface TransferRecipientPreview {
  /** partyId (bytes32) on-chain của bên nhận. */
  partyId: string;
  party: TransferParty;
  /** Bên nhận là cá nhân chưa liên kết ví: phải liên kết trước khi chấp nhận. */
  needsWallet: boolean;
}

/** `POST /me/owned-products/:id/transfer-authorizations`. */
export interface TransferAuthorizationInput {
  recipient: string;
  /** Số ngày bên nhận có để chấp nhận (1 đến 30). */
  days: number;
}

/** Giấy phép EIP-712 TransferAuthorization; ví chủ sở hữu gửi createTransferRequest. */
export interface TransferRequestAuthorization {
  method: 'createTransferRequest';
  chainId: number;
  contractAddress: string;
  /** Ví phải gửi giao dịch. */
  wallet: string;
  productId: string;
  fromPartyId: string;
  toPartyId: string;
  /** Giây Unix, dạng chuỗi thập phân. */
  expiresAt: string;
  deadline: string;
  signature: string;
  recipient: TransferParty;
}

export interface TransferProduct {
  id: string;
  publicCode: string;
  serialNumber: string;
  modelName: string;
  chainProductId: string;
  issuer: OrganizationLabel;
}

/** Một yêu cầu chuyển nhượng (transfer_requests), như bên gửi hoặc bên nhận thấy. */
export interface TransferRequestView {
  id: string;
  /** requestId on-chain (số thứ tự trong OwnershipTransfer), dạng chuỗi thập phân. */
  requestId: string;
  state: TransferState;
  /** Còn REQUESTED nhưng đã quá hạn: không chấp nhận được, ai cũng đóng được (TRF-05). */
  expired: boolean;
  /** Người đang xem là bên gửi hay bên nhận. */
  direction: 'OUTGOING' | 'INCOMING';
  from: TransferParty;
  to: TransferParty;
  product: TransferProduct;
  requestedAt: string;
  expiresAt: string;
  closedAt: string | null;
  createdTxHash: string;
  closedTxHash: string | null;
}

/** `GET /me/owned-products/:id/transfer`: phần chuyển nhượng trên trang sản phẩm đã mua. */
export interface OwnedProductTransfer {
  /** `null` khi tạo được yêu cầu mới; ngược lại là lý do không tạo được. */
  blockedReason: string | null;
  contract: ContractInfo | null;
  /** Ví đang dùng của người xem (chữ thường); `null` khi chưa liên kết. */
  wallet: string | null;
  /** Yêu cầu đang mở của sản phẩm (có thể đã quá hạn nhưng chưa đóng). */
  active: TransferRequestView | null;
  /** Các yêu cầu đã đóng mà người xem là bên gửi, mới nhất trước. */
  history: TransferRequestView[];
}

export type TransferFilter = 'INCOMING' | 'OUTGOING' | 'CLOSED';

/** `GET /me/transfers`: yêu cầu gửi tới hoặc do người dùng (hay tổ chức họ đại diện) gửi. */
export interface MyTransfers {
  contract: ContractInfo | null;
  wallet: string | null;
  items: TransferRequestView[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<TransferFilter, number>;
}
