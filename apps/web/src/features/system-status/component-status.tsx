import type { ComponentHealth, HealthDetailValue, HealthStatus } from '@dpp/shared';
import { Badge } from '@/components/ui/badge';
import { formatNumber } from '@/lib/format';
import type { Tone } from '@/lib/state-labels';

export const HEALTH_STATUS_LABELS: Record<HealthStatus, { label: string; tone: Tone }> = {
  up: { label: 'Hoạt động', tone: 'ok' },
  degraded: { label: 'Chạy dự phòng', tone: 'warn' },
  down: { label: 'Không hoạt động', tone: 'bad' },
};

export interface DetailField {
  key: string;
  label: string;
  format?: (value: HealthDetailValue) => string;
}

function defaultFormat(value: HealthDetailValue): string {
  if (value === null) {
    return 'Không có';
  }
  return typeof value === 'number' ? formatNumber(value) : String(value);
}

/** Một dòng trạng thái: tên thành phần, mô tả, độ trễ và chi tiết kỹ thuật. */
export function ComponentStatus({
  name,
  description,
  health,
  fields,
}: {
  name: string;
  description: string;
  health: ComponentHealth | undefined;
  fields: readonly DetailField[];
}) {
  const status = HEALTH_STATUS_LABELS[health?.status ?? 'down'];
  const details = health?.details ?? {};
  const visibleFields = fields.filter((field) => field.key in details);

  return (
    <div className="px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">{name}</h2>
          <p className="mt-0.5 text-sm text-muted">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          {health ? (
            <span className="text-sm text-muted tabular-nums">{health.latencyMs} ms</span>
          ) : null}
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
        </div>
      </div>

      {visibleFields.length > 0 ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          {visibleFields.map((field) => {
            const value = details[field.key] ?? null;
            return (
              <div key={field.key}>
                <dt className="text-muted">{field.label}</dt>
                <dd className="mt-0.5 font-medium tabular-nums">
                  {(field.format ?? defaultFormat)(value)}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : null}

      {health?.error ? (
        <p className="mt-4 rounded-control bg-bad-tint px-3 py-2 font-mono text-[13px] break-words text-bad">
          {health.error}
        </p>
      ) : null}
    </div>
  );
}
