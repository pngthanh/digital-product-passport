import type { ComponentHealth, HealthStatus } from '@dpp/shared';

export type { ComponentHealth, HealthReport, HealthStatus, LivenessReport } from '@dpp/shared';

/**
 * Trạng thái tổng của hệ thống: chỉ một thành phần `down` là tổng `down`;
 * có thành phần `degraded` (ví dụ đang chạy bằng RPC dự phòng) thì tổng `degraded`.
 */
export function aggregateHealth(components: Record<string, ComponentHealth>): HealthStatus {
  const statuses = Object.values(components).map((component) => component.status);
  if (statuses.length === 0 || statuses.includes('down')) {
    return 'down';
  }
  return statuses.includes('degraded') ? 'degraded' : 'up';
}
