import type { ProductSummary } from '@dpp/shared';
import { PRODUCT_STATE_LABELS, type StateLabel } from '@/lib/state-labels';

/** Nhãn trạng thái: bản nháp (chưa lên blockchain), lệch dữ liệu, hoặc trạng thái vòng đời on-chain. */
export function productStatusLabel(
  product: Pick<ProductSummary, 'syncStatus' | 'productState'>,
): StateLabel {
  if (product.syncStatus === 'FAILED') {
    return { label: 'Lệch dữ liệu on-chain', tone: 'bad' };
  }
  if (product.syncStatus !== 'CONFIRMED' || !product.productState) {
    return { label: 'Bản nháp', tone: 'warn' };
  }
  return PRODUCT_STATE_LABELS[product.productState];
}

export function warrantyLabel(months: number): string {
  return months === 0 ? 'Không bảo hành' : `${months} tháng`;
}
