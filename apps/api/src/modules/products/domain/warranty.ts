import type { WarrantyState } from '@dpp/shared';

/** Dòng warranties (dữ liệu [P], chiếu từ WarrantyManager). */
export interface WarrantyRecord {
  productId: string;
  activatedByPartyId: string;
  activatedAt: Date;
  expiresAt: Date;
  warrantyState: WarrantyState;
  activationTxHash: string;
}

/** Hết hạn suy ra theo thời gian, kể cả khi đang tạm dừng (D10, giống `effectiveWarrantyState`). */
export function effectiveWarrantyState(
  warranty: Pick<WarrantyRecord, 'warrantyState' | 'expiresAt'>,
  now: Date,
): WarrantyState {
  return now.getTime() >= warranty.expiresAt.getTime() ? 'EXPIRED' : warranty.warrantyState;
}
