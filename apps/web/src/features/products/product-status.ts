import type { PartyLabel, ProductSummary } from '@dpp/shared';
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

/** Tên một bên: tổ chức hiện tên; cá nhân không hiện tên (người xem là chủ thì ghi "Bạn"). */
export function partyText(party: PartyLabel | null): string {
  if (!party) {
    return 'Không có';
  }
  if (party.kind === 'ORGANIZATION') {
    return party.organization.name;
  }
  return party.isYou ? 'Bạn' : 'Người dùng cá nhân';
}

/** Sản phẩm đang ở đâu, cho danh sách và hộ chiếu; `null` khi còn là bản nháp. */
export function locationText(
  product: Pick<ProductSummary, 'productState' | 'holder' | 'syncStatus'> & {
    pendingRetailer: { name: string } | null;
  },
): string | null {
  if (product.syncStatus !== 'CONFIRMED' || !product.productState) {
    return null;
  }
  if (product.productState === 'IN_DISTRIBUTION' && product.pendingRetailer) {
    return `Đang gửi tới ${product.pendingRetailer.name}`;
  }
  if (product.holder?.kind === 'PERSON') {
    return product.holder.isYou ? 'Bạn đang giữ' : 'Người mua đang giữ';
  }
  return product.holder ? `Đang ở ${product.holder.organization.name}` : null;
}
