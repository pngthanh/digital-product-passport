import { Inject, Injectable } from '@nestjs/common';
import {
  aggregateHealth,
  type ComponentHealth,
  type HealthReport,
  type LivenessReport,
} from '../domain/health-report.js';
import { HEALTH_INDICATORS, type HealthIndicator } from './health-indicator.port.js';

export const SERVICE_NAME = 'dpp-api';

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  constructor(@Inject(HEALTH_INDICATORS) private readonly indicators: HealthIndicator[]) {}

  /** Tiến trình còn sống, không phụ thuộc hạ tầng bên ngoài. */
  liveness(): LivenessReport {
    return {
      status: 'ok',
      service: SERVICE_NAME,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  /** Kiểm tra song song mọi thành phần; một thành phần lỗi không làm hỏng cả báo cáo. */
  async readiness(): Promise<HealthReport> {
    const entries = await Promise.all(
      this.indicators.map(async (indicator): Promise<[string, ComponentHealth]> => {
        try {
          return [indicator.key, await indicator.check()];
        } catch (error) {
          return [indicator.key, { status: 'down', latencyMs: 0, error: describeError(error) }];
        }
      }),
    );
    const components = Object.fromEntries(entries);
    return {
      status: aggregateHealth(components),
      service: SERVICE_NAME,
      checkedAt: new Date().toISOString(),
      components,
    };
  }
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
