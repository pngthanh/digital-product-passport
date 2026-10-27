/*
 * Hợp đồng dữ liệu của endpoint /health — dùng chung cho API (trả về) và Web (hiển thị).
 */

export type HealthStatus = 'up' | 'degraded' | 'down';

export type HealthDetailValue = string | number | boolean | null;

export interface ComponentHealth {
  status: HealthStatus;
  latencyMs: number;
  details?: Record<string, HealthDetailValue>;
  error?: string;
}

export interface HealthReport {
  status: HealthStatus;
  service: string;
  checkedAt: string;
  components: Record<string, ComponentHealth>;
}

export interface LivenessReport {
  status: 'ok';
  service: string;
  uptimeSeconds: number;
  timestamp: string;
}
