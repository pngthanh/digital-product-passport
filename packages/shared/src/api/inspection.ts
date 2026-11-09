/*
 * Hợp đồng dữ liệu của module Inspection (M8: yêu cầu và kết quả kiểm định), dùng chung cho API
 * và Web.
 */

import type {
  InspectionRequestState,
  InspectionResult,
  ProductState,
  SyncStatus,
} from '../domain/enums.js';
import type { EvidenceMimeType } from '../domain/evidence-file.js';
import type { ChainEventView } from './chain.js';
import type { ContractInfo } from './organizations.js';
import type { ManufacturerInfo, OrganizationLabel } from './products.js';
import type { ServiceTicketProduct } from './service.js';

/** Đơn vị kiểm định đã duyệt, để người gửi chọn (INS-02). */
export interface InspectorOption {
  organizationId: string;
  name: string;
  address: string | null;
  partyId: string;
}

/** Ai gửi yêu cầu: nhà sản xuất (nhà phát hành) hay chủ sở hữu. */
export type InspectionRequesterRole = 'MANUFACTURER' | 'OWNER';

/** `POST /me/products/:id/inspection-requests` và `POST /me/owned-products/:id/inspection-requests`. */
export interface InspectionRequestInput {
  inspectorOrgId: string;
  note: string;
}

/** Biên bản kiểm định (dòng inspections) của một yêu cầu. */
export interface InspectionReportView {
  result: InspectionResult;
  summary: string;
  reportHash: string;
  /** Loại file ảnh/PDF đính kèm; `null` khi không có file. */
  fileType: EvidenceMimeType | null;
  /** Lúc ghi lên blockchain (event InspectionRecorded); `null` khi chưa ghi. */
  inspectedAt: string | null;
  txHash: string | null;
  syncStatus: SyncStatus;
  /** Băm lại biên bản và file đang lưu có ra đúng hash đã ghi on-chain không; `null` khi chưa ghi. */
  matchesOnchain: boolean | null;
}

/** Một yêu cầu kiểm định (inspection_requests) và kết quả nếu đã có. */
export interface InspectionRequestView {
  id: string;
  /** Mã kiểm định on-chain (bytes32), suy ra từ id. */
  inspectionId: string;
  state: InspectionRequestState;
  requesterRole: InspectionRequesterRole;
  note: string;
  inspector: OrganizationLabel;
  requestedAt: string;
  /** Lúc có kết quả, bị từ chối hoặc bị huỷ. */
  closedAt: string | null;
  declineReason: string | null;
  report: InspectionReportView | null;
}

/** `GET /me/products/:id/inspection`, `GET /me/owned-products/:id/inspection`. */
export interface ProductInspection {
  /** `null` khi gửi được yêu cầu mới; ngược lại là lý do không gửi được. */
  blockedReason: string | null;
  inspectors: InspectorOption[];
  /** Yêu cầu do chính bên đang xem gửi, mới nhất trước. */
  requests: InspectionRequestView[];
}

export type InspectionFilter = 'REQUESTED' | 'COMPLETED' | 'CLOSED';

export interface InspectionProduct extends ServiceTicketProduct {
  productState: ProductState;
}

export interface InspectionItem extends InspectionRequestView {
  product: InspectionProduct;
}

/** `GET /me/inspections`: yêu cầu gửi tới đơn vị kiểm định mà người dùng đại diện. */
export interface MyInspections {
  /** `null` khi người dùng không đại diện đơn vị kiểm định nào. */
  inspector: ManufacturerInfo | null;
  /** `null` khi API chưa cấu hình InspectionRegistry. */
  contract: ContractInfo | null;
  items: InspectionItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<InspectionFilter, number>;
}

/** Người gửi yêu cầu như đơn vị kiểm định thấy: tên nhà sản xuất, hoặc chủ sở hữu (email che bớt). */
export type InspectionRequesterInfo =
  { kind: 'MANUFACTURER'; name: string } | { kind: 'OWNER'; fullName: string; maskedEmail: string };

/** `GET /me/inspections/:id`. */
export interface InspectionDetail extends InspectionItem {
  requester: InspectionRequesterInfo;
  contract: ContractInfo | null;
  /** Event FINALIZED của lần kiểm định, cũ nhất trước. */
  history: ChainEventView[];
}

/**
 * `POST /me/inspections/:id/results`: biên bản đã lưu, kèm giấy phép EIP-712 của registrar; ví đơn
 * vị kiểm định gửi recordInspection với đúng các giá trị này (INS-01).
 */
export interface InspectionRecordAuthorization {
  method: 'recordInspection';
  chainId: number;
  contractAddress: string;
  /** Ví phải gửi giao dịch. */
  wallet: string;
  inspectionId: string;
  productId: string;
  inspectorId: string;
  requesterId: string;
  result: InspectionResult;
  /** Giá trị uint8 của `result` theo enum InspectionResult on-chain. */
  resultCode: number;
  reportHash: string;
  /** Giây Unix, dạng chuỗi thập phân. */
  deadline: string;
  signature: string;
}

/** `POST /me/inspections/:id/decline`. */
export interface InspectionDeclineInput {
  reason: string;
}

/** Một kết quả kiểm định trên hộ chiếu công khai: ai cũng xem được, kể cả file biên bản. */
export interface PublicInspectionView {
  id: string;
  inspectionId: string;
  inspector: OrganizationLabel;
  requesterRole: InspectionRequesterRole;
  result: InspectionResult;
  summary: string;
  fileType: EvidenceMimeType | null;
  reportHash: string;
  inspectedAt: string;
  txHash: string;
  matchesOnchain: boolean;
}

/** `GET /public/products/:code/inspections`: mới nhất trước. */
export interface PublicProductInspections {
  items: PublicInspectionView[];
}
