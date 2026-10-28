import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { parseEnv } from '../../src/config/env.schema.js';
import type { PrismaClient } from '../../src/infrastructure/database/generated/client.js';
import { createApiApp, offlineChain, sessionCookieFrom } from '../support/test-app.js';
import { createTestConfig } from '../support/test-config.js';
import { createTestPrisma, resetDatabase } from '../support/test-database.js';

const WEB_ORIGIN = 'http://localhost:3000';
const credentials = {
  email: 'An.Nguyen@Example.com',
  password: 'mat khau dai',
  fullName: 'Nguyễn An',
};

describe('ACC-01, ACC-02: đăng ký, đăng nhập, đăng xuất (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestPrisma();
    app = await createApiApp({ chain: offlineChain(parseEnv(process.env).CHAIN_ID) });
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());
  const register = () =>
    http().post('/api/v1/auth/register').set('Origin', WEB_ORIGIN).send(credentials);

  it('đăng ký: tạo users + parties, băm Argon2id, đặt cookie httpOnly', async () => {
    const response = await register();

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      account: { email: 'an.nguyen@example.com', fullName: 'Nguyễn An', systemRole: 'USER' },
      party: { partyType: 'USER', registeredOnChain: false },
      wallets: [],
    });
    expect(String(response.headers['set-cookie'])).toMatch(
      /dpp_session=.+; Path=\/; Expires=.+; HttpOnly; SameSite=Lax/,
    );

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'an.nguyen@example.com' },
      include: { party: true },
    });
    expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(user.party).toMatchObject({ partyType: 'USER', chainPartyId: null });
    expect(response.body.party.id).toBe(user.party?.id);
    expect(await prisma.auditLog.count({ where: { action: 'ACCOUNT_REGISTERED' } })).toBe(1);
  });

  it('GET /auth/me cần phiên; có cookie thì trả hồ sơ của chính mình', async () => {
    const cookie = sessionCookieFrom((await register()).headers['set-cookie']);

    await http().get('/api/v1/auth/me').expect(401);
    const me = await http().get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.account.email).toBe('an.nguyen@example.com');
  });

  it('email trùng (khác hoa thường) trả 409 EMAIL_TAKEN', async () => {
    await register();
    const response = await http()
      .post('/api/v1/auth/register')
      .send({ ...credentials, email: 'AN.NGUYEN@example.com' })
      .expect(409);

    expect(response.body.code).toBe('EMAIL_TAKEN');
  });

  it('dữ liệu sai định dạng trả 400 kèm chi tiết; mật khẩu yếu trả 422', async () => {
    const invalid = await http()
      .post('/api/v1/auth/register')
      .send({ email: 'khong-phai-email', password: 'mat khau dai', fullName: '' })
      .expect(400);
    expect(invalid.body.details.map((issue: { path: string }) => issue.path)).toEqual([
      'email',
      'fullName',
    ]);

    const weak = await http()
      .post('/api/v1/auth/register')
      .send({ ...credentials, password: 'ngan' })
      .expect(422);
    expect(weak.body.code).toBe('WEAK_PASSWORD');
  });

  it('đăng nhập sai và đúng mật khẩu', async () => {
    await register();

    const wrong = await http()
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: 'sai mat khau' })
      .expect(401);
    expect(wrong.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });

    const ok = await http()
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);
    expect(sessionCookieFrom(ok.headers['set-cookie'])).toMatch(/^dpp_session=/);
    expect(await prisma.auditLog.count({ where: { action: 'SIGN_IN_FAILED' } })).toBe(1);
  });

  it('đăng xuất thu hồi mọi phiên của tài khoản ngay lập tức (session_version)', async () => {
    const firstDevice = sessionCookieFrom((await register()).headers['set-cookie']);
    const secondDevice = sessionCookieFrom(
      (await http().post('/api/v1/auth/login').send(credentials)).headers['set-cookie'],
    );

    const logout = await http()
      .post('/api/v1/auth/logout')
      .set('Cookie', firstDevice)
      .set('Origin', WEB_ORIGIN)
      .expect(204);
    expect(String(logout.headers['set-cookie'])).toMatch(/dpp_session=;.*Expires=Thu, 01 Jan 1970/);

    for (const cookie of [firstDevice, secondDevice]) {
      const response = await http().get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
      expect(response.body.code).toBe('SESSION_REQUIRED');
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'an.nguyen@example.com' } });
    expect(user.sessionVersion).toBe(1);
  });

  it('tài khoản bị khoá: không đăng nhập được, phiên cũ mất hiệu lực', async () => {
    const cookie = sessionCookieFrom((await register()).headers['set-cookie']);
    await prisma.user.update({
      where: { email: 'an.nguyen@example.com' },
      data: { status: 'LOCKED' },
    });

    const login = await http().post('/api/v1/auth/login').send(credentials).expect(403);
    expect(login.body.code).toBe('ACCOUNT_LOCKED');
    await http().get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
  });

  it('chặn request ghi dữ liệu đến từ origin lạ (CSRF)', async () => {
    const response = await http()
      .post('/api/v1/auth/login')
      .set('Origin', 'https://trang-gia-mao.example')
      .send(credentials)
      .expect(403);

    expect(response.body.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('các endpoint liên kết ví đều cần đăng nhập', async () => {
    await http()
      .post('/api/v1/me/wallet-links/challenge')
      .send({ address: `0x${'11'.repeat(20)}`, purpose: 'LINK' })
      .expect(401);
  });
});

describe('Giới hạn số lần đăng nhập (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const config = createTestConfig({
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      CHAIN_ID: String(parseEnv(process.env).CHAIN_ID),
      AUTH_RATE_LIMIT_PER_MINUTE: '3',
    });
    app = await createApiApp({ config, chain: offlineChain(config.chain.chainId) });
  });

  afterAll(async () => {
    await app.close();
  });

  const attempt = () =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'khong-co@example.com', password: 'sai mat khau' });

  it('trả 429 sau 3 lần thử trong một phút từ cùng một IP', async () => {
    for (let index = 0; index < 3; index += 1) {
      expect((await attempt()).status).toBe(401);
    }
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toContain('quá nhiều lần');
  });
});
