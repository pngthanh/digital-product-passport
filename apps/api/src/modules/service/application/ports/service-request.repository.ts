import type { ServiceActionCode, ServiceTicketFilter } from '@dpp/shared';
import type { TransactionScope } from '../../../../common/persistence/transaction-scope.js';
import type { ServiceRecordRow, ServiceRequestRecord } from '../../domain/service-request.js';

export interface NewServiceRequest {
  productId: string;
  requestedByPartyId: string;
  serviceCenterOrgId: string;
  issueDesc: string;
}

export interface NewServiceRecord {
  serviceRequestId: string;
  actionCode: ServiceActionCode;
  actionDetail: string | null;
  evidenceUrl: string | null;
  evidenceHash: string;
}

export interface ServiceTicketQuery {
  serviceCenterOrgId: string;
  filter: ServiceTicketFilter;
  page: number;
  pageSize: number;
}

/** ServiceTicketOpened: REQUESTED thành IN_REPAIR. */
export interface TicketOpenedProjection {
  requestId: string;
  chainTicketId: string;
  warrantyCovered: boolean;
  openedAt: Date;
  openTxHash: string;
}

/** ServiceTicketClosed: IN_REPAIR thành REPAIRED hoặc REJECTED. */
export interface TicketClosedProjection {
  requestId: string;
  state: 'REPAIRED' | 'REJECTED';
  closedAt: Date;
  closeTxHash: string;
}

/** Bảng service_requests và service_records. */
export interface ServiceRequestRepository {
  /** Ném `ServiceRequestOpenError` khi sản phẩm đã có yêu cầu đang mở (ux_service_one_open). */
  create(request: NewServiceRequest): Promise<ServiceRequestRecord>;
  findById(id: string, scope?: TransactionScope): Promise<ServiceRequestRecord | null>;
  /** Mới nhất trước. */
  listForProduct(productId: string): Promise<ServiceRequestRecord[]>;
  listForCenter(
    query: ServiceTicketQuery,
  ): Promise<{ items: ServiceRequestRecord[]; total: number }>;
  countsForCenter(serviceCenterOrgId: string): Promise<Record<ServiceTicketFilter, number>>;
  /** REQUESTED thành CANCELLED; `false` nếu yêu cầu không còn ở REQUESTED. */
  cancel(id: string, at: Date): Promise<boolean>;
  /**
   * Huỷ các yêu cầu REQUESTED khác của sản phẩm (trừ `exceptId`), khi chain đã mở phiếu cho một yêu
   * cầu mà chủ sở hữu vừa huỷ; trả số dòng đã huỷ.
   */
  cancelOtherRequests(
    productId: string,
    exceptId: string,
    at: Date,
    scope: TransactionScope,
  ): Promise<number>;
  /** Chỉ đổi dòng REQUESTED hoặc CANCELLED (chain là nguồn sự thật); `false` nếu không đổi. */
  markOpened(projection: TicketOpenedProjection, scope: TransactionScope): Promise<boolean>;
  /** Chỉ đổi dòng IN_REPAIR; `false` nếu không đổi. */
  markClosed(projection: TicketClosedProjection, scope: TransactionScope): Promise<boolean>;

  /** Biên bản theo yêu cầu, mới nhất trước. */
  recordsOf(requestIds: readonly string[]): Promise<Map<string, ServiceRecordRow[]>>;
  /** Lưu biên bản chờ ghi on-chain; biên bản PENDING cũ của cùng yêu cầu bị thay thế. */
  savePendingRecord(record: NewServiceRecord): Promise<ServiceRecordRow>;
  /**
   * Biên bản PENDING có đúng `evidenceHash` thành CONFIRMED; PENDING khác của yêu cầu thành FAILED.
   * Trả `false` khi không có biên bản nào khớp hash.
   */
  confirmRecord(
    requestId: string,
    evidenceHash: string,
    confirmation: { txHash: string; recordedAt: Date },
    scope: TransactionScope,
  ): Promise<boolean>;
}

export const SERVICE_REQUEST_REPOSITORY = Symbol('SERVICE_REQUEST_REPOSITORY');
