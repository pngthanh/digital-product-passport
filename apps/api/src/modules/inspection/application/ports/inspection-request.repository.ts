import type { InspectionFilter, InspectionResult } from '@dpp/shared';
import type { TransactionScope } from '../../../../common/persistence/transaction-scope.js';
import type { InspectionRequestRecord, InspectionRow } from '../../domain/inspection-request.js';

export interface NewInspectionRequest {
  productId: string;
  requestedByPartyId: string;
  inspectorOrgId: string;
  note: string;
}

export interface NewInspection {
  requestId: string;
  productId: string;
  inspectorOrgId: string;
  result: InspectionResult;
  summary: string;
  reportUrl: string | null;
  reportHash: string;
}

export interface InspectionListQuery {
  inspectorOrgId: string;
  filter: InspectionFilter;
  page: number;
  pageSize: number;
}

/** InspectionRecorded đã finalized. */
export interface InspectionConfirmation {
  chainInspectionId: string;
  txHash: string;
  inspectedAt: Date;
}

/** Bảng inspection_requests và inspections. */
export interface InspectionRequestRepository {
  /** Ném `InspectionRequestPendingError` khi sản phẩm đã có yêu cầu chờ (ux_inspection_one_pending). */
  create(request: NewInspectionRequest): Promise<InspectionRequestRecord>;
  findById(id: string, scope?: TransactionScope): Promise<InspectionRequestRecord | null>;
  /** Mới nhất trước. */
  listForProduct(productId: string): Promise<InspectionRequestRecord[]>;
  listForInspector(
    query: InspectionListQuery,
  ): Promise<{ items: InspectionRequestRecord[]; total: number }>;
  countsForInspector(inspectorOrgId: string): Promise<Record<InspectionFilter, number>>;
  /** REQUESTED thành CANCELLED; `false` nếu yêu cầu không còn chờ. */
  cancel(id: string, at: Date): Promise<boolean>;
  /** REQUESTED thành DECLINED kèm lý do; `false` nếu yêu cầu không còn chờ. */
  decline(id: string, reason: string, at: Date): Promise<boolean>;
  /**
   * Thành COMPLETED từ mọi trạng thái khác (chain là nguồn sự thật, kể cả khi vừa bị huỷ hoặc từ
   * chối); `false` nếu đã COMPLETED.
   */
  markCompleted(requestId: string, at: Date, scope: TransactionScope): Promise<boolean>;

  /** Biên bản theo yêu cầu, mới nhất trước. */
  inspectionsOf(requestIds: readonly string[]): Promise<Map<string, InspectionRow[]>>;
  /** Lưu biên bản chờ ghi on-chain; biên bản PENDING cũ của cùng yêu cầu bị thay thế. */
  savePendingInspection(inspection: NewInspection): Promise<InspectionRow>;
  /**
   * Biên bản PENDING có đúng `reportHash` thành CONFIRMED; PENDING khác của yêu cầu thành FAILED.
   * Trả `false` khi không có biên bản nào khớp hash.
   */
  confirmInspection(
    requestId: string,
    reportHash: string,
    confirmation: InspectionConfirmation,
    scope: TransactionScope,
  ): Promise<boolean>;
}

export const INSPECTION_REQUEST_REPOSITORY = Symbol('INSPECTION_REQUEST_REPOSITORY');
