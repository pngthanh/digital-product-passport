import type { ProductState, WarrantyState } from '@dpp/shared';

/** (M12) Số liệu sản phẩm và bảo hành cho dashboard Admin (AUD-02). */
export interface ProductSummary {
  /** Bản nháp chưa ghi lên blockchain. */
  drafts: number;
  byState: Record<ProductState, number>;
  /** Trạng thái bảo hành đã tính hết hạn theo `now` (D10). */
  warranties: Record<WarrantyState, number>;
}

/** Sản phẩm đổi chủ nhiều lần trong một khoảng (luật RAPID_OWNERSHIP_CHANGES). */
export interface OwnershipBurst {
  productId: string;
  changes: number;
}

export interface ProductStatistics {
  summary(now: Date): Promise<ProductSummary>;
  ownershipBursts(since: Date, minChanges: number): Promise<OwnershipBurst[]>;
}

export const PRODUCT_STATISTICS = Symbol('PRODUCT_STATISTICS');
