import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { percentOf } from './chart-scale';

/** Ô số liệu: nhãn, giá trị lớn, một dòng phụ; có `href` thì cả ô là liên kết. */
export function StatTile({
  label,
  value,
  sub,
  href,
  tone = 'default',
}: {
  label: string;
  value: number;
  sub?: ReactNode;
  href?: Route;
  /** `attention`: viền vàng khi có việc cần Admin xem. */
  tone?: 'default' | 'attention';
}) {
  const body = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight">{formatNumber(value)}</p>
      {sub ? <p className="mt-1 text-sm text-muted">{sub}</p> : null}
    </>
  );
  const classes = cn(
    'block min-w-0 rounded-panel border bg-surface px-4 py-4 sm:px-5',
    tone === 'attention' ? 'border-warn' : 'border-line',
  );
  return href ? (
    <Link href={href} className={cn(classes, 'transition-colors hover:bg-tint')}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

export interface BarRow {
  key: string;
  label: string;
  value: number;
}

/**
 * Danh sách thanh ngang (một hàng một mục, cùng một đường gốc): so sánh các phần với nhau mà vẫn
 * đọc được số. Giữ thứ tự tự nhiên của mục (vòng đời), không xếp lại theo độ lớn.
 */
export function BarList({ rows, label }: { rows: readonly BarRow[]; label: string }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const peak = Math.max(0, ...rows.map((row) => row.value));
  return (
    <ul aria-label={label} className="grid gap-2.5">
      {rows.map((row) => (
        <li
          key={row.key}
          className="grid grid-cols-[minmax(7rem,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm max-sm:grid-cols-[minmax(0,1fr)_auto]"
        >
          <span className="truncate">{row.label}</span>
          <span aria-hidden className="h-2.5 rounded-full max-sm:order-last max-sm:col-span-2">
            <span
              className="block h-full rounded-r-[4px] bg-chart-1"
              style={{
                width: peak > 0 && row.value > 0 ? `max(2px, ${(row.value / peak) * 100}%)` : 0,
              }}
            />
          </span>
          <span className="text-right tabular-nums">
            {formatNumber(row.value)}
            <span className="ml-1.5 inline-block w-9 text-muted">
              {percentOf(row.value, total)}%
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Bảng nhỏ "nhãn: số" cho các luồng nghiệp vụ. */
export function CountList({
  items,
}: {
  items: readonly { label: string; value: number; attention?: boolean }[];
}) {
  return (
    <dl className="grid gap-1.5 text-sm">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">{item.label}</dt>
          <dd
            className={cn(
              'tabular-nums',
              item.attention && item.value > 0 ? 'font-semibold text-warn' : 'text-ink',
            )}
          >
            {formatNumber(item.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
