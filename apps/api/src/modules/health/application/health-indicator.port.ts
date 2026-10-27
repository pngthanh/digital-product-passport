import type { ComponentHealth } from '../domain/health-report.js';

/** Cổng (port) kiểm tra một thành phần hạ tầng; tầng infrastructure cung cấp hiện thực. */
export interface HealthIndicator {
  readonly key: string;
  check(): Promise<ComponentHealth>;
}

export const HEALTH_INDICATORS = Symbol('HEALTH_INDICATORS');
