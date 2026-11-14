import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { parseEnv } from '../../src/config/env.schema.js';
import { createApiApp, offlineChain } from '../support/test-app.js';
import { createTestConfig } from '../support/test-config.js';

const CODE = 'KMNPQRSTAAAB';

/**
 * M11 (D83): các đường dẫn /public/* dùng chung một bộ đếm theo IP; IP lấy từ X-Forwarded-For mà
 * web (cùng máy, loopback) chuyển tiếp. Giới hạn đăng nhập đếm riêng.
 */
describe('Giới hạn lượt tra cứu công khai (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const config = createTestConfig({
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      CHAIN_ID: String(parseEnv(process.env).CHAIN_ID),
      PUBLIC_RATE_LIMIT_PER_MINUTE: '4',
      AUTH_RATE_LIMIT_PER_MINUTE: '10000',
    });
    app = await createApiApp({ config, chain: offlineChain(config.chain.chainId) });
  });

  afterAll(async () => {
    await app.close();
  });

  const lookup = (path: string, ip: string) =>
    request(app.getHttpServer()).get(`/api/v1/public/${path}`).set('X-Forwarded-For', ip);

  it('quá 4 lần một phút (gộp mọi đường dẫn công khai) thì trả 429 kèm thông báo tiếng Việt', async () => {
    const ip = '203.0.113.10';
    for (const path of [
      `products/${CODE}`,
      `products/${CODE}/inspections`,
      `products/${CODE}/lifecycle`,
      `products/${CODE}/verification`,
    ]) {
      expect((await lookup(path, ip)).status).not.toBe(429);
    }
    const blocked = await lookup(`products/${CODE}`, ip);
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe(
      'Bạn tra cứu quá nhiều lần trong một phút. Đợi một chút rồi thử lại.',
    );
  });

  it('IP khác có bộ đếm riêng; đăng nhập không bị giới hạn tra cứu chặn', async () => {
    expect((await lookup(`products/${CODE}`, '203.0.113.20')).status).toBe(404);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '203.0.113.10')
      .send({ email: 'khong-co@example.com', password: 'sai mat khau' });
    expect(login.status).toBe(401);
  });
});
