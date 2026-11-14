import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { ChainLink } from '@/components/ui/chain-link';
import { HashText } from '@/components/ui/hash-text';
import { Panel } from '@/components/ui/panel';
import { requireAdmin } from '@/features/admin/admin-context';
import { AlertReviewForm } from '@/features/monitoring/alert-review-form';
import { alertHeadline, detailDisplay } from '@/features/monitoring/alert-text';
import {
  ALERT_STATUS_LABELS,
  DECISION_LABELS,
  DETAIL_LABELS,
  ruleLabelOf,
  SEVERITY_LABELS,
} from '@/features/monitoring/monitoring-labels';
import { anomalyAlertSchema } from '@/features/monitoring/monitoring.schema';
import { serverChainId } from '@/lib/env';
import { formatDate, formatTime } from '@/lib/format';
import { serverFetch } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Chi tiết cảnh báo' };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Trường nội bộ (khoá chống trùng) không hiện cho Admin. */
const HIDDEN_DETAILS = new Set(['dedupeKey']);

function DetailValue({
  name,
  value,
  chainId,
}: {
  name: string;
  value: string | number | boolean | null;
  chainId: number;
}) {
  const display = detailDisplay(name, value);
  switch (display.kind) {
    case 'tx':
      return <ChainLink chainId={chainId} value={display.value} kind="tx" />;
    case 'address':
      return <ChainLink chainId={chainId} value={display.value} kind="address" />;
    case 'hash':
      return <HashText value={display.value} />;
    case 'time':
      return (
        <span className="tabular-nums">
          {formatTime(display.value)} {formatDate(display.value)}
        </span>
      );
    default:
      return <span className="break-words">{display.value}</span>;
  }
}

export default async function AdminAlertPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    notFound();
  }
  const result = await serverFetch(`/admin/alerts/${id}`, anomalyAlertSchema);
  if (!result.ok && result.status === 404) {
    notFound();
  }
  const chainId = serverChainId();

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <Panel className="px-5 py-6">
          <p className="font-medium text-bad">Không tải được cảnh báo từ API.</p>
        </Panel>
      </div>
    );
  }

  const alert = result.data;
  const rule = ruleLabelOf(alert.ruleCode);
  const severity = SEVERITY_LABELS[alert.severity];
  const status = ALERT_STATUS_LABELS[alert.status];
  const headline = alertHeadline(alert);
  const details = Object.entries(alert.details).filter(([key]) => !HIDDEN_DETAILS.has(key));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href={{ pathname: '/admin/alerts', query: { status: alert.status } }}
        className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
      >
        ← Cảnh báo
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{rule.title}</h1>
        <Badge tone={severity.tone} dot>
          Mức {severity.label.toLowerCase()}
        </Badge>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      {headline ? <p className="mt-2 text-lg">{headline}</p> : null}
      <p className="mt-2 max-w-2xl text-muted">{rule.hint}</p>

      <div className="mt-8 grid max-w-4xl gap-6">
        <Panel className="px-5 py-5" aria-labelledby="chi-tiet">
          <h2 id="chi-tiet" className="mb-4 font-semibold">
            Chi tiết
          </h2>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]">
            <dt className="text-muted">Phát hiện lúc</dt>
            <dd className="tabular-nums">
              {formatTime(alert.detectedAt)} {formatDate(alert.detectedAt)}
            </dd>
            {alert.product ? (
              <>
                <dt className="text-muted">Sản phẩm</dt>
                <dd>
                  {alert.product.modelName} ·{' '}
                  <span className="font-mono">{alert.product.serialNumber}</span>
                  <Link
                    href={`/p/${alert.product.publicCode}`}
                    className="ml-2 font-medium text-tint-ink underline-offset-4 hover:underline"
                  >
                    Mở hộ chiếu công khai
                  </Link>
                </dd>
              </>
            ) : null}
            {alert.party ? (
              <>
                <dt className="text-muted">
                  {alert.party.kind === 'ORGANIZATION'
                    ? 'Doanh nghiệp liên quan'
                    : 'Người liên quan'}
                </dt>
                <dd>
                  {alert.party.name}
                  {alert.party.email ? (
                    <span className="text-muted"> · {alert.party.email}</span>
                  ) : null}
                </dd>
              </>
            ) : null}
            {details.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-muted">{DETAIL_LABELS[key] ?? key}</dt>
                <dd className="min-w-0">
                  <DetailValue name={key} value={value} chainId={chainId} />
                </dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel className="px-5 py-5" aria-labelledby="xu-ly">
          <h2 id="xu-ly" className="mb-4 font-semibold">
            Xử lý
          </h2>
          {alert.review ? (
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]">
              <dt className="text-muted">Kết luận</dt>
              <dd className="font-medium">{DECISION_LABELS[alert.review.decision].label}</dd>
              <dt className="text-muted">Người chốt</dt>
              <dd>
                {alert.review.by
                  ? `${alert.review.by.fullName} · ${alert.review.by.email}`
                  : 'Không rõ'}
              </dd>
              <dt className="text-muted">Lúc</dt>
              <dd className="tabular-nums">
                {formatTime(alert.review.at)} {formatDate(alert.review.at)}
              </dd>
              <dt className="text-muted">Ghi chú</dt>
              <dd className="whitespace-pre-line break-words">{alert.review.note ?? 'Không có'}</dd>
            </dl>
          ) : (
            <AlertReviewForm alertId={alert.id} />
          )}
        </Panel>
      </div>
    </div>
  );
}
