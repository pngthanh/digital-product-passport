import type { ComponentHealth } from '../domain/health-report.js';
import type { HealthIndicator } from './health-indicator.port.js';
import { HealthService } from './health.service.js';

function indicator(key: string, check: () => Promise<ComponentHealth>): HealthIndicator {
  return { key, check };
}

describe('HealthService', () => {
  it('gộp kết quả của mọi thành phần', async () => {
    const service = new HealthService([
      indicator('database', async () => ({ status: 'up', latencyMs: 2 })),
      indicator('chain', async () => ({ status: 'degraded', latencyMs: 80 })),
    ]);

    const report = await service.readiness();

    expect(report.status).toBe('degraded');
    expect(Object.keys(report.components)).toEqual(['database', 'chain']);
  });

  it('một indicator ném lỗi chỉ làm thành phần đó down', async () => {
    const service = new HealthService([
      indicator('database', async () => ({ status: 'up', latencyMs: 2 })),
      indicator('chain', async () => {
        throw new Error('RPC timeout');
      }),
    ]);

    const report = await service.readiness();

    expect(report.status).toBe('down');
    expect(report.components.database?.status).toBe('up');
    expect(report.components.chain).toMatchObject({ status: 'down', error: 'RPC timeout' });
  });

  it('liveness không phụ thuộc hạ tầng', () => {
    const service = new HealthService([]);

    expect(service.liveness()).toMatchObject({ status: 'ok', service: 'dpp-api' });
  });
});
