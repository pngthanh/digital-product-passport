import { aggregateHealth } from './health-report.js';

const up = { status: 'up', latencyMs: 3 } as const;
const degraded = { status: 'degraded', latencyMs: 40 } as const;
const down = { status: 'down', latencyMs: 5000, error: 'timeout' } as const;

describe('aggregateHealth', () => {
  it('mọi thành phần up thì hệ thống up', () => {
    expect(aggregateHealth({ database: up, chain: up })).toBe('up');
  });

  it('một thành phần degraded thì hệ thống degraded', () => {
    expect(aggregateHealth({ database: up, chain: degraded })).toBe('degraded');
  });

  it('một thành phần down thì hệ thống down', () => {
    expect(aggregateHealth({ database: down, chain: degraded })).toBe('down');
  });

  it('không có thành phần nào được kiểm tra thì coi như down', () => {
    expect(aggregateHealth({})).toBe('down');
  });
});
