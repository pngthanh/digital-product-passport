import type { PublicInspectionView } from '@dpp/shared';
import { BROWSER_API_BASE } from '@/lib/env';
import { InspectionReport } from './inspection-report';

/** Kết quả kiểm định trên hộ chiếu công khai (mới nhất trước), kèm file biên bản và đối chiếu hash. */
export function PublicInspections({
  items,
  chainId,
}: {
  items: readonly PublicInspectionView[];
  chainId: number;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">Chưa có kết quả kiểm định nào được ghi nhận.</p>;
  }
  return (
    <ol className="grid gap-4">
      {items.map((item) => (
        <li
          key={item.id}
          className="grid gap-2 border-t border-line pt-4 first:border-t-0 first:pt-0"
        >
          <p className="text-sm">
            <span className="font-medium">{item.inspector.name}</span>
            <span className="text-muted">
              {' '}
              · theo yêu cầu của{' '}
              {item.requesterRole === 'MANUFACTURER' ? 'nhà sản xuất' : 'chủ sở hữu'}
            </span>
          </p>
          <InspectionReport
            report={{ ...item, confirmed: true }}
            fileHref={`${BROWSER_API_BASE}/public/inspections/${item.id}/report`}
            chainId={chainId}
          />
        </li>
      ))}
    </ol>
  );
}
