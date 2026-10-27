import 'server-only';
import type { HealthReport } from '@dpp/shared';
import { serverApiUrl } from '@/lib/env';
import { healthReportSchema } from './health-report.schema';

export type ReadinessResult =
  | { kind: 'reported'; report: HealthReport }
  | { kind: 'unreachable'; apiUrl: string; reason: string };

const REQUEST_TIMEOUT_MS = 8000;

/** Gọi /health/ready. API trả 503 khi chưa sẵn sàng nhưng vẫn kèm báo cáo, nên đọc cả hai mã. */
export async function getReadiness(): Promise<ReadinessResult> {
  const apiUrl = serverApiUrl();
  try {
    const response = await fetch(`${apiUrl}/health/ready`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const parsed = healthReportSchema.safeParse(await response.json());
    if (!parsed.success) {
      return {
        kind: 'unreachable',
        apiUrl,
        reason: `API trả dữ liệu không đúng định dạng (HTTP ${response.status})`,
      };
    }
    return { kind: 'reported', report: parsed.data };
  } catch (error) {
    return {
      kind: 'unreachable',
      apiUrl,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
