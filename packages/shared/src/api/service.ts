/*
 * Hợp đồng dữ liệu của module Service (M7: yêu cầu bảo hành, phiếu sửa chữa), dùng chung cho API
 * và Web.
 */

import type { EvidenceMimeType } from '../domain/evidence-file.js';
import type { ServiceActionCode } from '../domain/service-evidence.js';
import type { ServiceState, SyncStatus, WarrantyState } from '../domain/enums.js';
import type { ChainEventView } from './chain.js';
import type { ContractInfo } from './organizations.js';
import type { ManufacturerInfo, OrganizationLabel } from './products.js';

/** Trung tâm bảo hành đã duyệt, để chủ sở hữu chọn khi gửi yêu cầu (SVC-01). */
export interface ServiceCenterOption {
  organizationId: string;
  name: string;
  address: string | null;
  partyId: string;
}

/** `POST /me/owned-products/:id/service-requests`. */
export interface ServiceRequestInput {
  serviceCenterOrgId: string;
  issueDesc: string;
}

/** Biên bản sửa chữa (service_records) của một phiếu. */
export interface ServiceRecordView {
  actionCode: ServiceActionCode;
  actionDetail: string | null;
  evidenceHash: string;
  /** Loại file ảnh/PDF đính kèm; `null` khi không có file. */
  fileType: EvidenceMimeType | null;
  /** Lúc ghi lên blockchain (event ServiceTicketClosed); `null` khi chưa đóng phiếu. */
  recordedAt: string | null;
  txHash: string | null;
  syncStatus: SyncStatus;
  /**
   * Băm lại nội dung biên bản và file đang lưu trên máy chủ có ra đúng hash đã ghi on-chain không;
   * `null` khi chưa đóng phiếu.
   */
  matchesOnchain: boolean | null;
}

/** Một yêu cầu bảo hành và phiếu sửa chữa tương ứng (service_requests). */
export interface ServiceRequestView {
  id: string;
  /** Mã phiếu on-chain (bytes32), suy ra từ id; chỉ có trên blockchain sau khi trung tâm tiếp nhận. */
  ticketId: string;
  state: ServiceState;
  issueDesc: string;
  serviceCenter: OrganizationLabel;
  requestedAt: string;
  cancelledAt: string | null;
  /** Còn bảo hành lúc mở phiếu (bảo hành chi trả); `false` là sửa ngoài bảo hành. */
  warrantyCovered: boolean | null;
  openedAt: string | null;
  closedAt: string | null;
  openTxHash: string | null;
  closeTxHash: string | null;
  /** Biên bản đã ghi on-chain; phía trung tâm còn thấy biên bản đang chờ ghi. */
  record: ServiceRecordView | null;
}

/** `GET /me/owned-products/:id/service`: phần bảo hành, sửa chữa trên trang sản phẩm đã mua. */
export interface OwnedProductService {
  /** `null` khi gửi được yêu cầu mới; ngược lại là lý do không gửi được. */
  blockedReason: string | null;
  centers: ServiceCenterOption[];
  /** Mới nhất trước. */
  requests: ServiceRequestView[];
}

export type ServiceTicketFilter = 'REQUESTED' | 'IN_REPAIR' | 'CLOSED';

export interface ServiceTicketProduct {
  id: string;
  publicCode: string;
  serialNumber: string;
  modelName: string;
  chainProductId: string;
  issuer: OrganizationLabel;
}

/** Bảo hành của sản phẩm lúc xem, để trung tâm biết sửa trong hay ngoài bảo hành. */
export interface ServiceWarrantyInfo {
  /** Đã tính hết hạn theo giờ hiện tại. */
  state: WarrantyState;
  expiresAt: string;
}

export interface ServiceTicketItem extends ServiceRequestView {
  product: ServiceTicketProduct;
}

/** `GET /me/service-tickets`: phiếu của trung tâm bảo hành mà người dùng đại diện. */
export interface MyServiceTickets {
  /** `null` khi người dùng không đại diện trung tâm bảo hành nào. */
  serviceCenter: ManufacturerInfo | null;
  /** `null` khi API chưa cấu hình ServiceTicketManager. */
  contract: ContractInfo | null;
  items: ServiceTicketItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<ServiceTicketFilter, number>;
}

/** `GET /me/service-tickets/:id`. */
export interface ServiceTicketDetail extends ServiceTicketItem {
  /** Chủ sở hữu đã gửi yêu cầu; email đã che bớt. */
  requester: { fullName: string; maskedEmail: string };
  /** `null` khi sản phẩm chưa kích hoạt hoặc không có bảo hành. */
  warranty: ServiceWarrantyInfo | null;
  contract: ContractInfo | null;
  /** Event FINALIZED của phiếu (mở, đóng), cũ nhất trước. */
  history: ChainEventView[];
}

/** `POST /me/service-tickets/:id/opening-authorizations`: giấy phép EIP-712 cho SVC-03. */
export interface ServiceTicketOpeningAuthorization {
  method: 'openTicket';
  chainId: number;
  contractAddress: string;
  /** Ví phải gửi giao dịch. */
  wallet: string;
  ticketId: string;
  productId: string;
  serviceCenterId: string;
  requesterId: string;
  /** Giây Unix, dạng chuỗi thập phân. */
  deadline: string;
  signature: string;
}

/** `POST /me/service-tickets/:id/results`: biên bản đã lưu, ví trung tâm gửi closeTicket (SVC-04). */
export interface ServiceTicketClosing {
  method: 'closeTicket';
  chainId: number;
  contractAddress: string;
  wallet: string;
  ticketId: string;
  repaired: boolean;
  evidenceHash: string;
}
