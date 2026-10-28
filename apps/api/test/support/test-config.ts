import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../../src/config/app-config.service.js';
import { type Env, parseEnv } from '../../src/config/env.schema.js';

/** Khoá ký giấy phép dùng trong test (không bao giờ dùng trên mạng thật). */
export const TEST_REGISTRAR_KEY = `0x${'22'.repeat(32)}`;
export const TEST_PARTY_REGISTRY = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

/** AppConfigService thật, dựng từ biến môi trường giả lập đã qua `parseEnv`. */
export function createTestConfig(overrides: Record<string, string> = {}): AppConfigService {
  const env = parseEnv({
    DATABASE_URL: 'postgresql://dpp:secret@localhost:5432/dpp_test',
    RPC_URL: 'http://127.0.0.1:8545',
    CHAIN_ID: '31337',
    WEB_ORIGIN: 'http://localhost:3000',
    JWT_SECRET: 'test-secret-that-is-at-least-32-characters',
    REGISTRAR_SIGNER_PRIVATE_KEY: TEST_REGISTRAR_KEY,
    PARTY_REGISTRY_ADDRESS: TEST_PARTY_REGISTRY,
    ...overrides,
  });
  return new AppConfigService(new ConfigService<Env, true>(env));
}

/** Đồng hồ điều khiển được trong test. */
export class TestClock {
  constructor(private current = new Date('2026-10-28T08:00:00.000Z')) {}

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
