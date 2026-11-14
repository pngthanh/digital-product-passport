import type {
  AlertSummary,
  AnomalyAlertPage,
  AnomalyAlertView,
  AuditLogPage,
  DashboardStatistics,
} from '@dpp/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import type { PrismaClient } from '../../src/infrastructure/database/generated/client.js';
import { DetectAnomalies } from '../../src/modules/monitoring/index.js';
import { createApiApp, createWorkerContext, offlineChain } from '../support/test-app.js';
import { createTestConfig } from '../support/test-config.js';
import {
  createTestPrisma,
  randomAddress,
  randomBytes32,
  resetDatabase,
} from '../support/test-database.js';

const PASSWORD = 'mat khau dai';
const MINUTE = 60_000;

/**
 * M12 trên CSDL test, RPC ngoại tuyến: Worker phát hiện đăng nhập sai dồn dập và giao dịch treo,
 * chạy lại không tạo trùng; Admin xem dashboard, lọc nhật ký, xử lý cảnh báo kèm ghi chú.
 */
describe('AUD-01..04: nhật ký, dashboard, phát hiện và xử lý bất thường (e2e)', () => {
  let api: NestExpressApplication;
  let worker: TestingModule;
  let prisma: PrismaClient;
  let admin: TestAgent;
  let user: TestAgent;

  async function register(email: string, fullName: string): Promise<TestAgent> {
    const agent = request.agent(api.getHttpServer());
    await agent
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, fullName })
      .expect(201);
    return agent;
  }

  beforeAll(async () => {
    const config = createTestConfig({
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      AUTH_RATE_LIMIT_PER_MINUTE: '1000',
    });
    const chain = offlineChain(config.chain.chainId);
    prisma = createTestPrisma();
    await resetDatabase(prisma);
    api = await createApiApp({ config, chain });
    worker = await createWorkerContext(config, { chain });

    admin = await register('admin@dpp.vn', 'Quản trị viên');
    await prisma.user.update({ where: { email: 'admin@dpp.vn' }, data: { systemRole: 'ADMIN' } });
    user = await register('nguyen.an@gmail.com', 'Nguyễn An');
  });

  afterAll(async () => {
    await worker?.close();
    await api?.close();
    await prisma?.$disconnect();
  });

  it('AUD-03: Worker phát hiện đăng nhập sai dồn dập và giao dịch treo, chạy lại không tạo trùng', async () => {
    const anonymous = request(api.getHttpServer());
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await anonymous
        .post('/api/v1/auth/login')
        .send({ email: 'Nguyen.An@gmail.com', password: 'sai mat khau roi' })
        .expect(401);
    }
    const an = await prisma.user.findUniqueOrThrow({
      where: { email: 'nguyen.an@gmail.com' },
      include: { party: true },
    });
    const wallet = randomAddress();
    await prisma.chainTransaction.create({
      data: {
        initiatedByUserId: an.id,
        chainId: 31337,
        fromAddress: wallet,
        toAddress: randomAddress(),
        contractName: 'ProductPassport',
        method: 'sellAndActivateWarranty',
        txHash: randomBytes32(),
        txStatus: 'SUBMITTED',
        submittedAt: new Date(Date.now() - 40 * MINUTE),
      },
    });
    // Giao dịch mới gửi chưa tới ngưỡng 15 phút.
    await prisma.chainTransaction.create({
      data: {
        chainId: 31337,
        fromAddress: wallet,
        toAddress: randomAddress(),
        contractName: 'ProductPassport',
        method: 'transferCustody',
        txHash: randomBytes32(),
        txStatus: 'SUBMITTED',
        submittedAt: new Date(Date.now() - 2 * MINUTE),
      },
    });

    const detect = worker.get(DetectAnomalies);
    expect(await detect.runOnce()).toEqual({ SIGN_IN_BRUTE_FORCE: 1, TRANSACTION_STUCK: 1 });
    expect(await detect.runOnce()).toEqual({});

    const alerts = await prisma.anomalyAlert.findMany({ orderBy: { ruleCode: 'asc' } });
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toMatchObject({
      ruleCode: 'SIGN_IN_BRUTE_FORCE',
      severity: 'HIGH',
      partyId: an.party?.id,
      details: expect.objectContaining({ email: 'nguyen.an@gmail.com', failures: 12 }),
    });
    expect(alerts[1]).toMatchObject({
      ruleCode: 'TRANSACTION_STUCK',
      severity: 'MEDIUM',
      details: expect.objectContaining({ method: 'sellAndActivateWarranty', wallet }),
    });
  });

  it('chỉ Admin xem được dashboard, nhật ký và cảnh báo', async () => {
    for (const path of ['dashboard', 'audit-logs', 'alerts', 'alerts/summary']) {
      const response = await user.get(`/api/v1/admin/${path}`).expect(403);
      expect(response.body.code).toBe('ADMIN_REQUIRED');
    }
    await request(api.getHttpServer()).get('/api/v1/admin/dashboard').expect(401);
  });

  it('AUD-04: Admin xem cảnh báo kèm bên liên quan, chốt với ghi chú; chốt lại thì 409', async () => {
    const summary: AlertSummary = (await admin.get('/api/v1/admin/alerts/summary').expect(200))
      .body;
    expect(summary).toEqual({ open: 2, openHigh: 1 });

    const open: AnomalyAlertPage = (await admin.get('/api/v1/admin/alerts').expect(200)).body;
    expect(open.counts).toEqual({ OPEN: 2, ACKNOWLEDGED: 0, DISMISSED: 0 });
    const signIn = open.items.find((item) => item.ruleCode === 'SIGN_IN_BRUTE_FORCE');
    expect(signIn).toMatchObject({
      status: 'OPEN',
      party: { kind: 'PERSON', name: 'Nguyễn An', email: 'nguyen.an@gmail.com' },
      review: null,
    });
    const high: AnomalyAlertPage = (
      await admin.get('/api/v1/admin/alerts?severity=HIGH').expect(200)
    ).body;
    expect(high.items.map((item) => item.ruleCode)).toEqual(['SIGN_IN_BRUTE_FORCE']);

    const short = await admin
      .post(`/api/v1/admin/alerts/${signIn?.id}/review`)
      .send({ decision: 'ACKNOWLEDGED', note: 'ok' })
      .expect(400);
    expect(short.body.details.map((issue: { path: string }) => issue.path)).toEqual(['note']);

    const reviewed: AnomalyAlertView = (
      await admin
        .post(`/api/v1/admin/alerts/${signIn?.id}/review`)
        .send({ decision: 'ACKNOWLEDGED', note: '  Đã gọi cho chủ tài khoản, họ quên mật khẩu.  ' })
        .expect(200)
    ).body;
    expect(reviewed).toMatchObject({
      status: 'ACKNOWLEDGED',
      review: {
        decision: 'ACKNOWLEDGED',
        note: 'Đã gọi cho chủ tài khoản, họ quên mật khẩu.',
        by: { email: 'admin@dpp.vn' },
      },
    });

    const again = await admin
      .post(`/api/v1/admin/alerts/${signIn?.id}/review`)
      .send({ decision: 'DISMISSED', note: 'Báo nhầm, bỏ qua.' })
      .expect(409);
    expect(again.body.code).toBe('ALERT_ALREADY_REVIEWED');
    await admin.get('/api/v1/admin/alerts/00000000-0000-7000-8000-000000000000').expect(404);

    const acknowledged: AnomalyAlertPage = (
      await admin.get('/api/v1/admin/alerts?status=ACKNOWLEDGED').expect(200)
    ).body;
    expect(acknowledged.items).toHaveLength(1);
    expect(acknowledged.counts).toEqual({ OPEN: 1, ACKNOWLEDGED: 1, DISMISSED: 0 });

    // Đã xử lý thì luật chạy lại trong 24 giờ không mở cảnh báo mới cho cùng email.
    expect(await worker.get(DetectAnomalies).runOnce()).toEqual({});
  });

  it('AUD-01: nhật ký mới nhất trước, lọc theo hành động, email người thực hiện và ngày', async () => {
    const reviewed: AuditLogPage = (
      await admin.get('/api/v1/admin/audit-logs?action=ALERT_REVIEWED').expect(200)
    ).body;
    expect(reviewed.items).toHaveLength(1);
    expect(reviewed.items[0]).toMatchObject({
      actor: { email: 'admin@dpp.vn', fullName: 'Quản trị viên' },
      targetType: 'anomaly_alert',
      metadata: expect.objectContaining({
        decision: 'ACKNOWLEDGED',
        ruleCode: 'SIGN_IN_BRUTE_FORCE',
      }),
    });

    const failures: AuditLogPage = (
      await admin.get('/api/v1/admin/audit-logs?action=SIGN_IN_FAILED').expect(200)
    ).body;
    expect(failures.items).toHaveLength(12);
    expect(failures.nextCursor).toBeNull();

    const all: AuditLogPage = (await admin.get('/api/v1/admin/audit-logs').expect(200)).body;
    const times = all.items.map((item) => item.createdAt);
    expect(times).toEqual([...times].toSorted().toReversed());

    const byAdmin: AuditLogPage = (
      await admin.get('/api/v1/admin/audit-logs?actorEmail=ADMIN@dpp.vn').expect(200)
    ).body;
    expect(byAdmin.items.length).toBeGreaterThan(0);
    expect(byAdmin.items.every((item) => item.actor?.email === 'admin@dpp.vn')).toBe(true);
    const nobody: AuditLogPage = (
      await admin.get('/api/v1/admin/audit-logs?actorEmail=khong.co@dpp.vn').expect(200)
    ).body;
    expect(nobody.items).toEqual([]);

    const past: AuditLogPage = (
      await admin.get('/api/v1/admin/audit-logs?from=2020-01-01&to=2020-01-31').expect(200)
    ).body;
    expect(past.items).toEqual([]);
    await admin.get('/api/v1/admin/audit-logs?from=2026-13-01').expect(400);
    await admin.get('/api/v1/admin/audit-logs?from=2026-11-14&to=2026-11-01').expect(400);
  });

  it('AUD-02: dashboard gộp số liệu từng module, RPC lỗi thì phần Indexer để trống', async () => {
    const dashboard: DashboardStatistics = (await admin.get('/api/v1/admin/dashboard').expect(200))
      .body;

    expect(dashboard.accounts).toEqual({ total: 2, withWallet: 0, admins: 1 });
    expect(dashboard.organizations.MANUFACTURER).toEqual({
      DRAFT: 0,
      PENDING: 0,
      AUTHORIZED: 0,
      REJECTED: 0,
      DISABLED: 0,
    });
    expect(dashboard.products.drafts).toBe(0);
    expect(dashboard.transactions.byStatus.SUBMITTED).toBe(2);
    expect(dashboard.transactions.methods.map((method) => method.method).toSorted()).toEqual([
      'sellAndActivateWarranty',
      'transferCustody',
    ]);
    expect(dashboard.activity).toHaveLength(14);
    expect(dashboard.indexer).toEqual({ behindBlocks: null, lastIndexedAt: null });
    expect(dashboard.alerts).toEqual({ LOW: 0, MEDIUM: 1, HIGH: 0 });
  });
});
