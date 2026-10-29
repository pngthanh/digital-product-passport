import type { WarrantyView } from '@dpp/shared';
import { Badge } from '@/components/ui/badge';
import { ChainLink } from '@/components/ui/chain-link';
import { formatDate } from '@/lib/format';
import { WARRANTY_STATE_LABELS } from '@/lib/state-labels';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Số ngày bảo hành còn lại tính tới hôm nay (làm tròn lên); 0 khi đã hết hạn. */
export function daysLeft(expiresAt: string, now = new Date()): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now.getTime()) / DAY_MS));
}

/**
 * Bảo hành đọc từ WarrantyManager (qua Indexer): trạng thái đã tính hết hạn theo giờ hiện tại,
 * thời hạn theo lịch Việt Nam, bên kích hoạt và giao dịch kích hoạt.
 */
export function WarrantySummary({
  warranty,
  warrantyMonths,
  chainId,
}: {
  warranty: WarrantyView | null;
  warrantyMonths: number;
  chainId: number;
}) {
  if (!warranty) {
    return (
      <p className="text-sm text-muted">
        {warrantyMonths === 0
          ? 'Sản phẩm không có bảo hành.'
          : `Bảo hành ${warrantyMonths} tháng, kích hoạt khi nhà bán lẻ bán cho người dùng.`}
      </p>
    );
  }
  const state = WARRANTY_STATE_LABELS[warranty.state];
  const remaining = daysLeft(warranty.expiresAt);
  return (
    <dl className="grid gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={state.tone} dot>
          {state.label}
        </Badge>
        {warranty.state === 'ACTIVE' ? (
          <span className="text-muted">còn {remaining} ngày</span>
        ) : null}
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
        <dt className="text-muted">Thời hạn</dt>
        <dd>{warranty.months} tháng</dd>
        <dt className="text-muted">Từ ngày</dt>
        <dd>{formatDate(warranty.activatedAt)}</dd>
        <dt className="text-muted">Đến ngày</dt>
        <dd>{formatDate(warranty.expiresAt)}</dd>
        <dt className="text-muted">Kích hoạt bởi</dt>
        <dd>{warranty.activatedBy?.name ?? 'Nhà bán lẻ'}</dd>
        <dt className="text-muted">Giao dịch</dt>
        <dd>
          <ChainLink chainId={chainId} value={warranty.activationTxHash} kind="tx" />
        </dd>
      </div>
    </dl>
  );
}
