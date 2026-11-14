import type { InventoryFilter, InventoryItem } from '@dpp/shared';
import { ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { formatDate } from '@/lib/format';
import { productStatusLabel, warrantyLabel } from '../products/product-status';
import type { PassportTarget } from './distribution-flows';
import { ReceiptActions } from './receipt-actions';

/**
 * Kho của nhà bán lẻ. Chờ nhận: xác nhận hoặc từ chối ngay trên dòng; Đang bán: mở trang bán (hàng
 * bị thu hồi chỉ hiện nhãn, không bán được); Đã bán: ngày giao cho người mua.
 */
export function InventoryList({
  items,
  filter,
  target,
}: {
  items: readonly InventoryItem[];
  filter: InventoryFilter;
  /** Ví và contract; `null` khi chưa liên kết ví hoặc chưa cấu hình contract. */
  target: Omit<PassportTarget, 'productId' | 'chainProductId'> | null;
}) {
  return (
    <ul className="divide-y divide-line rounded-control border border-line">
      {items.map((item) => {
        const status = productStatusLabel(item);
        return (
          <li
            key={item.id}
            className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-4"
          >
            <div className="min-w-0">
              <Link
                href={`/inventory/${item.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {item.modelName}
              </Link>
              <p className="font-mono text-[13px] break-all text-muted">{item.serialNumber}</p>
            </div>
            <div className="text-sm text-muted">
              <p>{item.issuer.name}</p>
              <p>
                {filter === 'SOLD' && item.soldAt
                  ? `Bán ngày ${formatDate(item.soldAt)}`
                  : `Sản xuất ${formatDate(`${item.manufacturedOn}T00:00:00Z`)} · Bảo hành ${warrantyLabel(item.warrantyMonths).toLowerCase()}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {filter === 'INCOMING' && target ? (
                <ReceiptActions
                  compact
                  target={{ ...target, productId: item.id, chainProductId: item.chainProductId }}
                />
              ) : filter === 'IN_STOCK' && item.productState === 'AT_RETAIL' ? (
                <ButtonLink href={`/inventory/${item.id}`} size="sm">
                  <ShoppingBag aria-hidden className="size-4" />
                  Bán
                </ButtonLink>
              ) : (
                <Badge tone={status.tone} dot>
                  {status.label}
                </Badge>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
