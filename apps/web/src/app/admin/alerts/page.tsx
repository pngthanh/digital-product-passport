import {
  ALERT_STATUSES,
  ANOMALY_RULES,
  ANOMALY_SEVERITIES,
  type AlertStatusCode,
  type AnomalyAlertView,
} from '@dpp/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { buttonClasses } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { requireAdmin } from '@/features/admin/admin-context';
import { alertHeadline } from '@/features/monitoring/alert-text';
import {
  ALERT_STATUS_LABELS,
  ANOMALY_RULE_LABELS,
  DECISION_LABELS,
  ruleLabelOf,
  SEVERITY_LABELS,
} from '@/features/monitoring/monitoring-labels';
import { anomalyAlertPageSchema } from '@/features/monitoring/monitoring.schema';
import { cn } from '@/lib/cn';
import { formatDate, formatTime } from '@/lib/format';
import { serverGet } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Cảnh báo bất thường' };

type SearchParams = Record<string, string | string[] | undefined>;

function pick<T extends string>(values: readonly T[], value: SearchParams[string]): T | undefined {
  return values.find((item) => item === value);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function AlertRow({ alert }: { alert: AnomalyAlertView }) {
  const severity = SEVERITY_LABELS[alert.severity];
  const headline = alertHeadline(alert);
  const subject = [
    alert.product ? `${alert.product.modelName} · ${alert.product.serialNumber}` : null,
    alert.party ? alert.party.name : null,
  ].filter(Boolean);
  return (
    <li>
      <Link
        href={`/admin/alerts/${alert.id}`}
        className="grid gap-1.5 px-5 py-4 transition-colors hover:bg-tint sm:grid-cols-[6.5rem_minmax(0,1fr)_auto] sm:items-start sm:gap-4"
      >
        <span>
          <Badge tone={severity.tone} dot>
            {severity.label}
          </Badge>
        </span>
        <span className="min-w-0">
          <span className="block font-medium">{ruleLabelOf(alert.ruleCode).title}</span>
          {headline ? <span className="block text-sm break-words">{headline}</span> : null}
          {subject.length > 0 ? (
            <span className="block text-sm text-muted">{subject.join(' · ')}</span>
          ) : null}
          {alert.review ? (
            <span className="mt-1 block text-sm text-muted">
              {DECISION_LABELS[alert.review.decision].label}
              {alert.review.by ? ` bởi ${alert.review.by.fullName}` : ''}
              {alert.review.note ? `: ${alert.review.note}` : ''}
            </span>
          ) : null}
        </span>
        <span className="text-sm text-muted tabular-nums sm:text-right">
          {formatTime(alert.detectedAt)}
          <span className="max-sm:ml-1.5 sm:block">{formatDate(alert.detectedAt)}</span>
        </span>
      </Link>
    </li>
  );
}

export default async function AdminAlertsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const status: AlertStatusCode = pick(ALERT_STATUSES, params.status) ?? 'OPEN';
  const severity = pick(ANOMALY_SEVERITIES, params.severity);
  const rule = pick(ANOMALY_RULES, params.rule);
  const cursor =
    typeof params.cursor === 'string' && UUID.test(params.cursor) ? params.cursor : undefined;

  const query = new URLSearchParams({ status });
  if (severity) query.set('severity', severity);
  if (rule) query.set('rule', rule);
  const filterQuery = query.toString();
  if (cursor) query.set('cursor', cursor);
  const page = await serverGet(`/admin/alerts?${query.toString()}`, anomalyAlertPageSchema);

  const linkFor = (next: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    const merged = { status, severity, rule, ...next };
    for (const [key, value] of Object.entries(merged)) {
      if (value) search.set(key, value);
    }
    return `/admin/alerts?${search.toString()}` as const;
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Cảnh báo bất thường</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Indexer báo khi dữ liệu on-chain lệch CSDL; Worker quét định kỳ giao dịch treo, đăng nhập
        sai, đổi chủ dồn dập và việc chờ lâu. Mở từng cảnh báo để kiểm tra rồi chốt kèm ghi chú.
      </p>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
        <nav aria-label="Lọc theo trạng thái" className="flex flex-wrap gap-1.5">
          {ALERT_STATUSES.map((item) => (
            <Link
              key={item}
              href={linkFor({ status: item })}
              aria-current={item === status ? 'page' : undefined}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
                item === status
                  ? 'border-primary bg-primary font-medium text-primary-ink'
                  : 'border-line-strong text-muted hover:bg-tint hover:text-ink',
              )}
            >
              {ALERT_STATUS_LABELS[item].label}
              {page ? <span className="tabular-nums opacity-80">{page.counts[item]}</span> : null}
            </Link>
          ))}
        </nav>

        <form action="/admin/alerts" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="status" value={status} />
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Mức độ</span>
            <select
              name="severity"
              defaultValue={severity ?? ''}
              className="h-9 rounded-control border border-line-strong bg-surface px-2 text-sm"
            >
              <option value="">Tất cả</option>
              {ANOMALY_SEVERITIES.toReversed().map((item) => (
                <option key={item} value={item}>
                  {SEVERITY_LABELS[item].label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Luật</span>
            <select
              name="rule"
              defaultValue={rule ?? ''}
              className="h-9 max-w-64 rounded-control border border-line-strong bg-surface px-2 text-sm"
            >
              <option value="">Tất cả</option>
              {ANOMALY_RULES.map((item) => (
                <option key={item} value={item}>
                  {ANOMALY_RULE_LABELS[item].title}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'h-9' })}
          >
            Lọc
          </button>
          {severity || rule ? (
            <Link
              href={linkFor({ severity: undefined, rule: undefined })}
              className="h-9 px-2 text-sm leading-9 text-muted hover:text-ink"
            >
              Bỏ lọc
            </Link>
          ) : null}
        </form>
      </div>

      <Panel className="mt-4">
        {page === null ? (
          <p className="px-5 py-6 text-sm text-bad">Không tải được danh sách cảnh báo.</p>
        ) : page.items.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">
            {status === 'OPEN'
              ? 'Không có cảnh báo nào đang mở.'
              : 'Chưa có cảnh báo nào ở mục này.'}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {page.items.map((alert) => (
              <AlertRow key={alert.id} alert={alert} />
            ))}
          </ul>
        )}
      </Panel>

      {cursor || page?.nextCursor ? (
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          {cursor ? (
            <Link
              href={`/admin/alerts?${filterQuery}`}
              className="font-medium text-tint-ink underline-offset-4 hover:underline"
            >
              Về mới nhất
            </Link>
          ) : null}
          {page?.nextCursor ? (
            <Link
              href={linkFor({ cursor: page.nextCursor })}
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
