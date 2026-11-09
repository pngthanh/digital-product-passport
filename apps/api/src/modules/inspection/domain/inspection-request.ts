import {
  type InspectionRequesterRole,
  type InspectionRequestState,
  type InspectionResult,
  partyIdFromUuid,
  type ProductState,
  type SyncStatus,
  uuidFromPartyId,
} from '@dpp/shared';

/** Dòng inspection_requests: chỉ COMPLETED được chiếu từ event, còn lại off-chain. */
export interface InspectionRequestRecord {
  id: string;
  productId: string;
  /** UUID Party người gửi: nhà sản xuất (trùng id tổ chức, D25) hoặc chủ sở hữu. */
  requestedByPartyId: string;
  inspectorOrgId: string;
  note: string;
  requestState: InspectionRequestState;
  requestedAt: Date;
  closedAt: Date | null;
  declineReason: string | null;
}

/** Dòng inspections: biên bản PENDING khi đơn vị kiểm định lưu, CONFIRMED khi InspectionRecorded. */
export interface InspectionRow {
  id: string;
  requestId: string;
  productId: string;
  inspectorOrgId: string;
  result: InspectionResult;
  summary: string | null;
  /** Khoá file trong kho lưu trữ; `null` khi không đính kèm file. */
  reportUrl: string | null;
  reportHash: string;
  chainInspectionId: string | null;
  inspectedAt: Date | null;
  txHash: string | null;
  syncStatus: SyncStatus;
  createdAt: Date;
}

/** Trạng thái sản phẩm còn kiểm định được: chưa thu hồi, báo mất hay ngừng sử dụng. */
export const INSPECTABLE_STATES: readonly ProductState[] = [
  'CREATED',
  'IN_DISTRIBUTION',
  'AT_RETAIL',
  'SOLD',
];

/** inspectionId on-chain suy ra từ UUID yêu cầu, như partyId (UUID nằm ở 16 byte thấp). */
export function inspectionIdOf(requestId: string): string {
  return partyIdFromUuid(requestId);
}

/** UUID yêu cầu từ inspectionId trong event; `null` nếu không do hệ thống sinh ra. */
export function requestIdOf(inspectionId: string): string | null {
  try {
    return uuidFromPartyId(inspectionId);
  } catch {
    return null;
  }
}

/** Nhà sản xuất gửi thì Party người gửi chính là tổ chức phát hành sản phẩm. */
export function requesterRoleOf(
  request: Pick<InspectionRequestRecord, 'requestedByPartyId'>,
  issuerOrgId: string,
): InspectionRequesterRole {
  return request.requestedByPartyId === issuerOrgId ? 'MANUFACTURER' : 'OWNER';
}

/**
 * Người gửi còn quyền yêu cầu kiểm định: nhà phát hành ở mọi trạng thái còn hoạt động, chủ sở hữu
 * khi sản phẩm đã bán và vẫn thuộc họ. Cùng điều kiện với InspectionRegistry.
 */
export function requesterStillAllowed(
  requestedByPartyId: string,
  product: { issuerOrgId: string; productState: ProductState; currentOwnerPartyId: string | null },
): boolean {
  if (!INSPECTABLE_STATES.includes(product.productState)) {
    return false;
  }
  return (
    requestedByPartyId === product.issuerOrgId ||
    (product.productState === 'SOLD' && product.currentOwnerPartyId === requestedByPartyId)
  );
}
