/** Dòng recalls: PENDING khi nhà sản xuất chuẩn bị thu hồi, CONFIRMED khi ProductRecalled finalized. */
export interface RecallRecord {
  id: string;
  productId: string;
  issuerOrgId: string;
  reason: string;
  reasonHash: string;
  recalledAt: Date | null;
  txHash: string | null;
  confirmed: boolean;
}

/** Trạng thái sản phẩm còn thu hồi được (giống `ProductLifecycle._isRecallable`). */
export const RECALLABLE_STATES = ['CREATED', 'IN_DISTRIBUTION', 'AT_RETAIL', 'SOLD'] as const;

export function isRecallable(state: string | null): boolean {
  return (RECALLABLE_STATES as readonly (string | null)[]).includes(state);
}
