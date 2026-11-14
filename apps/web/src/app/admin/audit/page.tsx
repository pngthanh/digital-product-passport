import { AUDIT_ACTIONS, type AuditLogView } from '@dpp/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { requireAdmin } from '@/features/admin/admin-context';
import { detailDisplay } from '@/features/monitoring/alert-text';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_TARGET_LABELS,
  auditActionLabelOf,
} from '@/features/monitoring/monitoring-labels';
import { auditLogPageSchema } from '@/features/monitoring/monitoring.schema';
import { formatDate, formatTime } from '@/lib/format';
import { serverFetch } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Nhật ký kiểm toán' };

type SearchParams = Record<string, string | string[] | undefined>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SORTED_ACTIONS = [...AUDIT_ACTIONS].toSorted((a, b) =>
  AUDIT_ACTION_LABELS[a].localeCompare(AUDIT_ACTION_LABELS[b], 'vi'),
);

function text(value: SearchParams[string]): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** Metadata gọn trên một dòng: hash, địa chỉ rút gọn; bỏ giá trị lồng nhau. */
function metadataLine(metadata: AuditLogView['metadata']): string | null {
  if (!metadata) {
    return null;
  }
  const parts = Object.entries(metadata).flatMap(([key, value]) => {
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean' &&
      value !== null
    ) {
      return [];
    }
    const display = detailDisplay(key, value);
    const shown =
      display.kind === 'tx' || display.kind === 'address' || display.kind === 'hash'
        ? `${display.value.slice(0, 10)}…${display.value.slice(-4)}`
        : display.kind === 'time'
          ? `${formatTime(display.value)} ${formatDate(display.value)}`
          : display.value.length > 120
            ? `${display.value.slice(0, 120)}…`
            : display.value;
    return [`${key}: ${shown}`];
  });
  return parts.length > 0 ? parts.join(' · ') : null;
}

function LogRow({ log }: { log: AuditLogView }) {
  const meta = metadataLine(log.metadata);
  return (
    <li className="grid gap-1 px-5 py-3.5 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-4">
      <p className="text-sm text-muted tabular-nums">
        {formatTime(log.createdAt)}
        <span className="ml-1.5 sm:ml-0 sm:block">{formatDate(log.createdAt)}</span>
      </p>
      <div className="min-w-0 text-sm">
        <p>
          <span className="font-medium">{auditActionLabelOf(log.action)}</span>
          <span className="text-muted">
            {' · '}
            {log.actor ? `${log.actor.fullName} (${log.actor.email})` : 'Khách hoặc hệ thống'}
          </span>
        </p>
        <p className="text-muted">
          {AUDIT_TARGET_LABELS[log.targetType] ?? log.targetType}
          {log.targetId ? (
            <>
              {' '}
              <span className="font-mono text-[12px] break-all">{log.targetId}</span>
            </>
          ) : null}
          {log.ipAddress ? <span> · IP {log.ipAddress}</span> : null}
        </p>
        {meta ? (
          <p className="mt-0.5 font-mono text-[12px] break-words text-muted">{meta}</p>
        ) : null}
      </div>
    </li>
  );
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const action = AUDIT_ACTIONS.find((item) => item === params.action);
  const actorEmail = text(params.actorEmail);
  const from = text(params.from);
  const to = text(params.to);
  const cursor = text(params.cursor);

  const filters = new URLSearchParams();
  if (action) filters.set('action', action);
  if (actorEmail) filters.set('actorEmail', actorEmail);
  if (from && DAY.test(from)) filters.set('from', from);
  if (to && DAY.test(to)) filters.set('to', to);
  const filterQuery = filters.toString();
  const query = new URLSearchParams(filters);
  if (cursor && UUID.test(cursor)) query.set('cursor', cursor);

  const result = await serverFetch(`/admin/audit-logs?${query.toString()}`, auditLogPageSchema);
  const filtered = filterQuery !== '';
  const nextHref = (next: string) => {
    const search = new URLSearchParams(filters);
    search.set('cursor', next);
    return `/admin/audit?${search.toString()}` as const;
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Nhật ký kiểm toán</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Mọi thao tác quan trọng, mới nhất trước. Nhật ký chỉ được ghi thêm, không sửa hay xoá được.
      </p>

      <form
        action="/admin/audit"
        className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_9.5rem_9.5rem_auto] lg:items-end"
      >
        <label className="grid gap-1 text-sm">
          <span className="text-muted">Hành động</span>
          <select
            name="action"
            defaultValue={action ?? ''}
            className="h-9 rounded-control border border-line-strong bg-surface px-2 text-sm"
          >
            <option value="">Tất cả</option>
            {SORTED_ACTIONS.map((item) => (
              <option key={item} value={item}>
                {AUDIT_ACTION_LABELS[item]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">Email người thực hiện</span>
          <input
            type="email"
            name="actorEmail"
            defaultValue={actorEmail ?? ''}
            placeholder="ten@vidu.vn"
            className="h-9 rounded-control border border-line-strong bg-surface px-2 text-sm placeholder:text-muted"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">Từ ngày</span>
          <input
            type="date"
            name="from"
            defaultValue={from ?? ''}
            className="h-9 rounded-control border border-line-strong bg-surface px-2 text-sm"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">Đến ngày</span>
          <input
            type="date"
            name="to"
            defaultValue={to ?? ''}
            className="h-9 rounded-control border border-line-strong bg-surface px-2 text-sm"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'h-9' })}
          >
            Lọc
          </button>
          {filtered ? (
            <Link
              href="/admin/audit"
              className="h-9 px-2 text-sm leading-9 text-muted hover:text-ink"
            >
              Bỏ lọc
            </Link>
          ) : null}
        </div>
      </form>

      <Panel className="mt-4">
        {!result.ok ? (
          <p className="px-5 py-6 text-sm text-bad">
            {result.status === 400
              ? 'Bộ lọc không hợp lệ: kiểm tra email và khoảng ngày (ngày bắt đầu không sau ngày kết thúc).'
              : 'Không tải được nhật ký.'}
          </p>
        ) : result.data.items.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">
            {filtered ? 'Không có dòng nào khớp bộ lọc.' : 'Chưa có dòng nhật ký nào.'}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {result.data.items.map((log) => (
              <LogRow key={log.id} log={log} />
            ))}
          </ul>
        )}
      </Panel>

      {cursor || (result.ok && result.data.nextCursor) ? (
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          {cursor ? (
            <Link
              href={filterQuery ? `/admin/audit?${filterQuery}` : '/admin/audit'}
              className="font-medium text-tint-ink underline-offset-4 hover:underline"
            >
              Về mới nhất
            </Link>
          ) : null}
          {result.ok && result.data.nextCursor ? (
            <Link
              href={nextHref(result.data.nextCursor)}
              className="font-medium text-tint-ink underline-offset-4 hover:underline"
            >
              Cũ hơn
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
