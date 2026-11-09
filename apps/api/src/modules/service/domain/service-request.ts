import {
  partyIdFromUuid,
  type ServiceActionCode,
  type ServiceState,
  type SyncStatus,
  uuidFromPartyId,
} from '@dpp/shared';

/** Dòng service_requests: REQUESTED, CANCELLED chỉ có off-chain; còn lại chiếu từ event (D7). */
export interface ServiceRequestRecord {
  id: string;
  productId: string;
  /** UUID Party của chủ sở hữu gửi yêu cầu. */
  requestedByPartyId: string;
  serviceCenterOrgId: string;
  issueDesc: string;
  serviceState: ServiceState;
  requestedAt: Date;
  cancelledAt: Date | null;
  chainTicketId: string | null;
  warrantyCovered: boolean | null;
  openedAt: Date | null;
  closedAt: Date | null;
  openTxHash: string | null;
  closeTxHash: string | null;
}

/** Dòng service_records: biên bản PENDING khi trung tâm lưu, CONFIRMED khi ServiceTicketClosed. */
export interface ServiceRecordRow {
  id: string;
  serviceRequestId: string;
  actionCode: ServiceActionCode;
  actionDetail: string | null;
  /** Khoá file trong kho lưu trữ; `null` khi không đính kèm file. */
  evidenceUrl: string | null;
  evidenceHash: string;
  recordedAt: Date | null;
  txHash: string | null;
  syncStatus: SyncStatus;
  createdAt: Date;
}

/** Yêu cầu còn mở: mỗi sản phẩm tối đa một (ux_service_one_open, `_openTicketOf` on-chain). */
export const OPEN_SERVICE_STATES: readonly ServiceState[] = ['REQUESTED', 'IN_REPAIR'];

export function isOpenRequest(request: Pick<ServiceRequestRecord, 'serviceState'>): boolean {
  return OPEN_SERVICE_STATES.includes(request.serviceState);
}

/** ticketId on-chain suy ra từ UUID yêu cầu, như partyId (UUID nằm ở 16 byte thấp). */
export function ticketIdOf(requestId: string): string {
  return partyIdFromUuid(requestId);
}

/** UUID yêu cầu từ ticketId trong event; `null` nếu ticketId không do hệ thống sinh ra. */
export function requestIdOf(ticketId: string): string | null {
  try {
    return uuidFromPartyId(ticketId);
  } catch {
    return null;
  }
}
