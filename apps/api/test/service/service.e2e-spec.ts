import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type MyServiceTickets,
  type OrganizationApplicationAuthorization,
  type OwnedProductDetail,
  type OwnedProductService,
  PARTY_REGISTRY_ABI,
  partyIdFromUuid,
  PRODUCT_PASSPORT_ABI,
  type ProductRegistrationAuthorization,
  type ProductSaleAuthorization,
  type PublicPassportView,
  SERVICE_TICKET_MANAGER_ABI,
  serviceEvidenceHash,
  type ServiceRequestView,
  type ServiceTicketClosing,
  type ServiceTicketDetail,
  type ServiceTicketOpeningAuthorization,
  WARRANTY_MANAGER_ABI,
} from '@dpp/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TestingModule } from '@nestjs/testing';
import { Contract, type JsonRpcSigner, sha256, Wallet } from 'ethers';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import type { PrismaClient } from '../../src/infrastructure/database/generated/client.js';
import { ConfirmTransactions, IndexChainEvents } from '../../src/modules/chain-sync/index.js';
import { type LocalChain, startHardhatNode } from '../support/hardhat-chain.js';
import { createApiApp, createWorkerContext } from '../support/test-app.js';
import { createTestConfig, TEST_REGISTRAR_KEY } from '../support/test-config.js';
import { createTestPrisma, resetDatabase } from '../support/test-database.js';
import { authorize, submit } from '../support/wallet-flow.js';

const PASSWORD = 'mat khau dai';
/** PNG 1x1 hợp lệ, làm ảnh biên bản. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const SERIAL_COVERED = 'TV55-2611-00001';
const SERIAL_NO_WARRANTY = 'TV55-2611-00002';

async function ticketList(agent: TestAgent, filter: string): Promise<MyServiceTickets> {
  return (await agent.get(`/api/v1/me/service-tickets?filter=${filter}`).expect(200)).body;
}

/**
 * M7 trọn luồng trên Hardhat node: chủ sở hữu (không ví) gửi yêu cầu bảo hành (SVC-01), huỷ khi chưa
 * tiếp nhận (SVC-02), trung tâm mở phiếu, bảo hành tạm dừng (SVC-03), ghi biên bản kèm ảnh, đóng
 * phiếu, bảo hành tiếp tục (SVC-04). Sản phẩm không bảo hành vẫn sửa được, ghi "ngoài bảo hành".
 */
describe('SVC-01..04: yêu cầu bảo hành, phiếu sửa chữa (e2e, Hardhat node)', () => {
  let chain: LocalChain;
  let api: NestExpressApplication;
  let worker: TestingModule;
  let prisma: PrismaClient;
  let uploadDir: string;
  let registry: Contract;
  let passport: Contract;
  let warranty: Contract;
  let tickets: Contract;
  let adminWallet: JsonRpcSigner;
  let makerWallet: JsonRpcSigner;
  let shopWallet: JsonRpcSigner;
  let centerWallet: JsonRpcSigner;
  let otherCenterWallet: JsonRpcSigner;
  let maker: TestAgent;
  let shop: TestAgent;
  let center: TestAgent;
  let otherCenter: TestAgent;
  let buyer: TestAgent;
  let stranger: TestAgent;
  let visitor: TestAgent;
  let centerOrgId: string;
  let shopOrgId: string;
  const productIds: Record<string, string> = {};
  const chainProductIds: Record<string, string> = {};

  async function register(email: string, fullName: string): Promise<TestAgent> {
    const agent = request.agent(api.getHttpServer());
    await agent
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, fullName })
      .expect(201);
    return agent;
  }

  /** Worker chốt giao dịch đã báo và quét log của cả 4 contract tới block hiện tại. */
  async function sync(): Promise<void> {
    await worker.get(ConfirmTransactions).runOnce();
    const indexer = worker.get(IndexChainEvents);
    const head = BigInt(await chain.provider.send('eth_blockNumber', []));
    for (let round = 0; round < 20; round += 1) {
      await indexer.runOnce();
      const checkpoints = await prisma.indexerCheckpoint.findMany();
      if (
        checkpoints.length === 4 &&
        checkpoints.every((checkpoint) => checkpoint.lastFinalizedBlock >= head)
      ) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error('Indexer chưa bắt kịp');
  }

  async function linkWallet(agent: TestAgent, wallet: JsonRpcSigner): Promise<void> {
    const authorization = await authorize(agent, wallet, 'LINK');
    const txHash = await submit(wallet, authorization);
    await agent
      .post(`/api/v1/me/wallet-links/${authorization.walletId}/transaction`)
      .send({ txHash })
      .expect(202);
    await sync();
  }

  /** Nộp đơn bằng ví cá nhân, Admin duyệt; trả id tổ chức. */
  async function approvedOrganization(
    agent: TestAgent,
    wallet: JsonRpcSigner,
    profile: {
      name: string;
      taxCode: string;
      orgType: 'MANUFACTURER' | 'RETAILER' | 'SERVICE_CENTER';
      address: string;
    },
  ): Promise<string> {
    const response = await agent
      .post('/api/v1/me/organization/application')
      .send({ ...profile, contactEmail: `lienhe@${profile.taxCode}.vn` })
      .expect(201);
    const auth: OrganizationApplicationAuthorization = response.body;
    await (
      await registry.connect(wallet).getFunction('applyOrganization')(
        auth.partyId,
        auth.role,
        auth.profileHash,
        BigInt(auth.deadline),
        auth.signature,
      )
    ).wait();
    await (
      await registry.connect(adminWallet).getFunction('approveOrganization')(auth.partyId)
    ).wait();
    await sync();
    const organization = await prisma.organization.findFirstOrThrow({
      where: { taxCode: profile.taxCode },
    });
    return organization.id;
  }

  async function sendPassport(
    wallet: JsonRpcSigner,
    method: string,
    args: unknown[],
  ): Promise<void> {
    await (await passport.connect(wallet).getFunction(method)(...args)).wait();
    await sync();
  }

  /** Ví trung tâm gửi openTicket/closeTicket, web báo txHash, Worker chốt. */
  async function sendTicket(
    wallet: JsonRpcSigner,
    method: 'openTicket' | 'closeTicket',
    args: unknown[],
    reportAs: TestAgent | null = center,
  ): Promise<string> {
    const tx = await tickets.connect(wallet).getFunction(method)(...args);
    await tx.wait();
    if (reportAs) {
      await reportAs
        .post('/api/v1/me/service-tickets/transactions')
        .send({ txHash: tx.hash })
        .expect(202);
    }
    await sync();
    return tx.hash;
  }

  async function ownedService(serial: string): Promise<OwnedProductService> {
    return (await buyer.get(`/api/v1/me/owned-products/${productIds[serial]}/service`).expect(200))
      .body;
  }

  async function ticket(id: string): Promise<ServiceTicketDetail> {
    return (await center.get(`/api/v1/me/service-tickets/${id}`).expect(200)).body;
  }

  async function requestService(serial: string, issueDesc: string): Promise<ServiceRequestView> {
    return (
      await buyer
        .post(`/api/v1/me/owned-products/${productIds[serial]}/service-requests`)
        .send({ serviceCenterOrgId: centerOrgId, issueDesc })
        .expect(201)
    ).body;
  }

  /** SVC-03: trung tâm nhận giấy phép rồi ví trung tâm mở phiếu. */
  async function openTicket(requestId: string): Promise<ServiceTicketOpeningAuthorization> {
    const auth: ServiceTicketOpeningAuthorization = (
      await center
        .post(`/api/v1/me/service-tickets/${requestId}/opening-authorizations`)
        .expect(201)
    ).body;
    await sendTicket(centerWallet, 'openTicket', [
      auth.ticketId,
      auth.productId,
      auth.requesterId,
      BigInt(auth.deadline),
      auth.signature,
    ]);
    return auth;
  }

  beforeAll(async () => {
    prisma = createTestPrisma();
    await resetDatabase(prisma);
    uploadDir = await mkdtemp(join(tmpdir(), 'dpp-evidence-'));
    chain = await startHardhatNode();
    [adminWallet, makerWallet, shopWallet, centerWallet, otherCenterWallet] = await Promise.all([
      chain.signer(0),
      chain.signer(2),
      chain.signer(3),
      chain.signer(4),
      chain.signer(5),
    ]);
    const registryAddress = await chain.deployPartyRegistry(
      new Wallet(TEST_REGISTRAR_KEY).address,
      { registrationFee: 0n },
    );
    const contracts = await chain.deployProductContracts(registryAddress);
    const ticketManager = await chain.deployServiceTicketManager({
      partyRegistry: registryAddress,
      ...contracts,
    });
    registry = new Contract(registryAddress, PARTY_REGISTRY_ABI, chain.provider);
    passport = new Contract(contracts.productPassport, PRODUCT_PASSPORT_ABI, chain.provider);
    warranty = new Contract(contracts.warrantyManager, WARRANTY_MANAGER_ABI, chain.provider);
    tickets = new Contract(ticketManager, SERVICE_TICKET_MANAGER_ABI, chain.provider);
    const deployBlock = String(await chain.provider.getBlockNumber());
    const config = createTestConfig({
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      JWT_SECRET: process.env.JWT_SECRET ?? '',
      AUTH_RATE_LIMIT_PER_MINUTE: '10000',
      RPC_URL: chain.url,
      CHAIN_ID: '31337',
      PARTY_REGISTRY_ADDRESS: registryAddress,
      PARTY_REGISTRY_DEPLOY_BLOCK: deployBlock,
      PRODUCT_PASSPORT_ADDRESS: contracts.productPassport,
      PRODUCT_PASSPORT_DEPLOY_BLOCK: deployBlock,
      WARRANTY_MANAGER_ADDRESS: contracts.warrantyManager,
      SERVICE_TICKET_MANAGER_ADDRESS: ticketManager,
      SERVICE_TICKET_MANAGER_DEPLOY_BLOCK: deployBlock,
      UPLOAD_DIR: uploadDir,
    });
    api = await createApiApp({ config });
    worker = await createWorkerContext(config);
    visitor = request.agent(api.getHttpServer());

    const admin = await register('admin@dpp.vn', 'Quản trị viên');
    await prisma.user.update({ where: { email: 'admin@dpp.vn' }, data: { systemRole: 'ADMIN' } });
    await linkWallet(admin, adminWallet);
    maker = await register('daidien@anphat.vn', 'Đại diện An Phát');
    shop = await register('daidien@saomai.vn', 'Đại diện Sao Mai');
    center = await register('kythuat@minhphat.vn', 'Kỹ thuật Minh Phát');
    otherCenter = await register('kythuat@baolong.vn', 'Kỹ thuật Bảo Long');
    buyer = await register('khach.hang@gmail.com', 'Trần Thị Khách');
    stranger = await register('nguoi.la@gmail.com', 'Người Lạ');
    for (const [agent, wallet] of [
      [maker, makerWallet],
      [shop, shopWallet],
      [center, centerWallet],
      [otherCenter, otherCenterWallet],
    ] as const) {
      await linkWallet(agent, wallet);
    }
    await approvedOrganization(maker, makerWallet, {
      name: 'Công ty TNHH Thiết bị Gia dụng An Phát',
      taxCode: '0318765432',
      orgType: 'MANUFACTURER',
      address: 'Lô C5, KCN Tân Bình, TP. Hồ Chí Minh',
    });
    shopOrgId = await approvedOrganization(shop, shopWallet, {
      name: 'Siêu thị Điện máy Sao Mai',
      taxCode: '0312345678',
      orgType: 'RETAILER',
      address: '120 Nguyễn Trãi, Quận 1, TP. Hồ Chí Minh',
    });
    centerOrgId = await approvedOrganization(center, centerWallet, {
      name: 'Trung tâm Bảo hành Minh Phát',
      taxCode: '0311112222',
      orgType: 'SERVICE_CENTER',
      address: '15 Lý Thường Kiệt, Quận 10, TP. Hồ Chí Minh',
    });
    await approvedOrganization(otherCenter, otherCenterWallet, {
      name: 'Trung tâm Sửa chữa Bảo Long',
      taxCode: '0313334444',
      orgType: 'SERVICE_CENTER',
      address: '8 Hoàng Quốc Việt, Cầu Giấy, Hà Nội',
    });

    // Hai TV: một chiếc bảo hành 24 tháng, một chiếc không bảo hành; bán cả hai cho người mua.
    const items = [
      { serialNumber: SERIAL_COVERED, warrantyMonths: 24 },
      { serialNumber: SERIAL_NO_WARRANTY, warrantyMonths: 0 },
    ].map((item) => ({
      ...item,
      modelName: 'Smart TV 55 inch QLED',
      description: null,
      manufacturedOn: '2026-10-20',
    }));
    const registration: ProductRegistrationAuthorization = (
      await maker.post('/api/v1/me/products/registrations').send({ items }).expect(201)
    ).body;
    await sendPassport(makerWallet, 'registerProducts', [
      registration.issuerId,
      registration.productIds,
      registration.metadataHashes,
      registration.warrantyMonths,
      BigInt(registration.deadline),
      registration.signature,
    ]);
    for (const [index, created] of registration.products.entries()) {
      productIds[created.serialNumber] = created.id;
      chainProductIds[created.serialNumber] = registration.productIds[index] ?? '';
      const target = chainProductIds[created.serialNumber];
      await sendPassport(makerWallet, 'dispatchCustody', [target, partyIdFromUuid(shopOrgId)]);
      await sendPassport(shopWallet, 'confirmCustodyReceipt', [target]);
      const sale: ProductSaleAuthorization = (
        await shop
          .post(`/api/v1/me/inventory/${created.id}/sale-authorizations`)
          .send({ buyerEmail: 'khach.hang@gmail.com' })
          .expect(201)
      ).body;
      await sendPassport(shopWallet, 'sellAndActivateWarranty', [
        sale.productId,
        sale.buyerId,
        BigInt(sale.deadline),
        sale.signature,
      ]);
    }
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    await worker?.close();
    await chain?.stop();
    await prisma?.$disconnect();
    if (uploadDir) {
      await rm(uploadDir, { recursive: true, force: true });
    }
  });

  it('chủ sở hữu thấy trung tâm đã duyệt để chọn; người khác không xem được sản phẩm', async () => {
    const service = await ownedService(SERIAL_COVERED);
    expect(service.blockedReason).toBeNull();
    expect(service.centers.map((option) => option.name)).toEqual([
      'Trung tâm Bảo hành Minh Phát',
      'Trung tâm Sửa chữa Bảo Long',
    ]);
    expect(service.requests).toEqual([]);
    await stranger
      .get(`/api/v1/me/owned-products/${productIds[SERIAL_COVERED]}/service`)
      .expect(404);
    await shop.get(`/api/v1/me/owned-products/${productIds[SERIAL_COVERED]}/service`).expect(404);
  });

  it('SVC-01, SVC-02: gửi yêu cầu (không cần ví), mỗi sản phẩm một yêu cầu đang mở; chưa tiếp nhận thì huỷ được', async () => {
    const wrongCenter = await buyer
      .post(`/api/v1/me/owned-products/${productIds[SERIAL_COVERED]}/service-requests`)
      .send({ serviceCenterOrgId: shopOrgId, issueDesc: 'Không lên hình' })
      .expect(422);
    expect(wrongCenter.body.code).toBe('SERVICE_CENTER_NOT_FOUND');
    await buyer
      .post(`/api/v1/me/owned-products/${productIds[SERIAL_COVERED]}/service-requests`)
      .send({ serviceCenterOrgId: centerOrgId, issueDesc: '   ' })
      .expect(400);

    const first = await requestService(SERIAL_COVERED, 'Không lên hình');
    expect(first).toMatchObject({
      state: 'REQUESTED',
      serviceCenter: { name: 'Trung tâm Bảo hành Minh Phát' },
      openTxHash: null,
    });
    const duplicate = await buyer
      .post(`/api/v1/me/owned-products/${productIds[SERIAL_COVERED]}/service-requests`)
      .send({ serviceCenterOrgId: centerOrgId, issueDesc: 'Gửi lại' })
      .expect(409);
    expect(duplicate.body.code).toBe('SERVICE_REQUEST_OPEN');
    expect((await ownedService(SERIAL_COVERED)).blockedReason).toMatch(/chưa xong/);

    await stranger.post(`/api/v1/me/service-requests/${first.id}/cancel`).expect(404);
    await buyer.post(`/api/v1/me/service-requests/${first.id}/cancel`).expect(204);
    const second = await requestService(SERIAL_COVERED, 'Màn hình có sọc ngang, tiếng vẫn có');
    expect((await ownedService(SERIAL_COVERED)).requests.map((item) => item.state)).toEqual([
      'REQUESTED',
      'CANCELLED',
    ]);
    expect(second.ticketId).toMatch(/^0x0{32}[0-9a-f]{32}$/);
  });

  it('trung tâm được chọn thấy yêu cầu, chủ sở hữu (email che bớt), bảo hành; trung tâm khác không thấy', async () => {
    const list = await ticketList(center, 'REQUESTED');
    expect(list.serviceCenter).toMatchObject({
      orgType: 'SERVICE_CENTER',
      authStatus: 'AUTHORIZED',
    });
    expect(list.counts).toEqual({ REQUESTED: 1, IN_REPAIR: 0, CLOSED: 0 });
    expect(list.items[0]).toMatchObject({
      issueDesc: 'Màn hình có sọc ngang, tiếng vẫn có',
      product: {
        serialNumber: SERIAL_COVERED,
        issuer: { name: 'Công ty TNHH Thiết bị Gia dụng An Phát' },
      },
    });
    const id = list.items[0]!.id;
    expect(await ticket(id)).toMatchObject({
      requester: { fullName: 'Trần Thị Khách', maskedEmail: 'k***@gmail.com' },
      warranty: { state: 'ACTIVE' },
      history: [],
    });

    expect((await ticketList(otherCenter, 'REQUESTED')).counts.REQUESTED).toBe(0);
    await otherCenter.get(`/api/v1/me/service-tickets/${id}`).expect(404);
    await otherCenter.post(`/api/v1/me/service-tickets/${id}/opening-authorizations`).expect(404);
    await shop.get(`/api/v1/me/service-tickets/${id}`).expect(403);
    expect((await ticketList(buyer, 'REQUESTED')).serviceCenter).toBeNull();
  });

  it('SVC-03: trung tâm mở phiếu bằng ví; bảo hành tạm dừng; chủ sở hữu không huỷ được nữa', async () => {
    const id = (await ticketList(center, 'REQUESTED')).items[0]!.id;
    const auth = await openTicket(id);
    expect(auth).toMatchObject({
      method: 'openTicket',
      productId: chainProductIds[SERIAL_COVERED],
    });

    const detail = await ticket(id);
    expect(detail).toMatchObject({
      state: 'IN_REPAIR',
      warrantyCovered: true,
      warranty: { state: 'SUSPENDED' },
      history: [{ eventName: 'ServiceTicketOpened' }],
    });
    expect(detail.openTxHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(
      Number(await warranty.getFunction('effectiveWarrantyState')(chainProductIds[SERIAL_COVERED])),
    ).toBe(2);
    const owned: OwnedProductDetail = (
      await buyer.get(`/api/v1/me/owned-products/${productIds[SERIAL_COVERED]}`).expect(200)
    ).body;
    expect(owned.warranty?.state).toBe('SUSPENDED');

    const cancel = await buyer.post(`/api/v1/me/service-requests/${id}/cancel`).expect(409);
    expect(cancel.body.code).toBe('SERVICE_REQUEST_STATE');
    await center.post(`/api/v1/me/service-tickets/${id}/opening-authorizations`).expect(409);
    // Nhà bán lẻ không báo được giao dịch của trung tâm bảo hành.
    await shop
      .post('/api/v1/me/service-tickets/transactions')
      .send({ txHash: detail.openTxHash })
      .expect(403);
  });

  it('SVC-04: biên bản kèm ảnh; file sai loại bị chặn; đóng phiếu thì bảo hành tiếp tục, hash khớp on-chain', async () => {
    const id = (await ticketList(center, 'IN_REPAIR')).items[0]!.id;
    const fake = await center
      .post(`/api/v1/me/service-tickets/${id}/results`)
      .field('repaired', 'true')
      .field('actionCode', 'REPLACE_PART')
      .attach('evidence', Buffer.from('MZ không phải ảnh'), {
        filename: 'bien-ban.png',
        contentType: 'image/png',
      })
      .expect(422);
    expect(fake.body.code).toBe('EVIDENCE_FILE');

    const closing: ServiceTicketClosing = (
      await center
        .post(`/api/v1/me/service-tickets/${id}/results`)
        .field('repaired', 'true')
        .field('actionCode', 'REPLACE_PART')
        .field('actionDetail', '  Thay bo mạch   T-CON, kiểm tra 2 giờ ổn định ')
        .attach('evidence', PNG, { filename: 'bien-ban.png', contentType: 'image/png' })
        .expect(201)
    ).body;
    expect(closing.evidenceHash).toBe(
      serviceEvidenceHash({
        ticketId: closing.ticketId,
        repaired: true,
        actionCode: 'REPLACE_PART',
        actionDetail: 'Thay bo mạch T-CON, kiểm tra 2 giờ ổn định',
        file: { sha256: sha256(PNG), mimeType: 'image/png' },
      }),
    );
    expect((await ticket(id)).record).toMatchObject({
      syncStatus: 'PENDING',
      fileType: 'image/png',
    });
    // Chủ sở hữu chưa thấy biên bản khi chưa ghi on-chain.
    expect((await ownedService(SERIAL_COVERED)).requests[0]?.record).toBeNull();

    const txHash = await sendTicket(centerWallet, 'closeTicket', [
      closing.ticketId,
      closing.repaired,
      closing.evidenceHash,
    ]);
    const detail = await ticket(id);
    expect(detail).toMatchObject({
      state: 'REPAIRED',
      closeTxHash: txHash,
      warranty: { state: 'ACTIVE' },
      record: {
        syncStatus: 'CONFIRMED',
        txHash,
        evidenceHash: closing.evidenceHash,
        matchesOnchain: true,
      },
      history: [{ eventName: 'ServiceTicketOpened' }, { eventName: 'ServiceTicketClosed' }],
    });

    const mine = (await ownedService(SERIAL_COVERED)).requests[0];
    expect(mine).toMatchObject({
      state: 'REPAIRED',
      warrantyCovered: true,
      record: { actionCode: 'REPLACE_PART', matchesOnchain: true },
    });
    const file = await buyer
      .get(`/api/v1/me/service-requests/${id}/evidence`)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(Buffer.isBuffer(file.body) && Buffer.compare(file.body, PNG)).toBe(0);
    await stranger.get(`/api/v1/me/service-requests/${id}/evidence`).expect(404);
    await otherCenter.get(`/api/v1/me/service-requests/${id}/evidence`).expect(404);
  });

  it('hành trình và hộ chiếu công khai có bước sửa chữa; không lộ mô tả lỗi hay biên bản', async () => {
    const owned: OwnedProductDetail = (
      await buyer.get(`/api/v1/me/owned-products/${productIds[SERIAL_COVERED]}`).expect(200)
    ).body;
    expect(owned.journey.slice(-2)).toMatchObject([
      {
        kind: 'SERVICE_OPENED',
        warrantyCovered: true,
        from: { kind: 'ORGANIZATION', organization: { name: 'Trung tâm Bảo hành Minh Phát' } },
      },
      {
        kind: 'SERVICE_REPAIRED',
        from: { organization: { name: 'Trung tâm Bảo hành Minh Phát' } },
      },
    ]);

    const row = await prisma.product.findUniqueOrThrow({
      where: { id: productIds[SERIAL_COVERED] },
    });
    const view: PublicPassportView = (
      await visitor.get(`/api/v1/public/products/${row.publicCode}`).expect(200)
    ).body;
    expect(view.journey.map((step) => step.kind)).toContain('SERVICE_REPAIRED');
    expect(view.warranty?.state).toBe('ACTIVE');
    expect(JSON.stringify(view)).not.toMatch(/sọc ngang|T-CON|khach\.hang/);
  });

  it('sản phẩm không bảo hành vẫn sửa được: phiếu "ngoài bảo hành", không sửa được thì REJECTED', async () => {
    const created = await requestService(SERIAL_NO_WARRANTY, 'Không bật nguồn');
    await openTicket(created.id);
    expect(await ticket(created.id)).toMatchObject({
      state: 'IN_REPAIR',
      warrantyCovered: false,
      warranty: null,
    });

    const closing: ServiceTicketClosing = (
      await center
        .post(`/api/v1/me/service-tickets/${created.id}/results`)
        .field('repaired', 'false')
        .field('actionCode', 'INSPECTION_ONLY')
        .field('actionDetail', 'Chập nguồn do nước vào, không còn linh kiện thay')
        .expect(201)
    ).body;
    await sendTicket(centerWallet, 'closeTicket', [closing.ticketId, false, closing.evidenceHash]);

    const mine = (await ownedService(SERIAL_NO_WARRANTY)).requests[0];
    expect(mine).toMatchObject({
      state: 'REJECTED',
      warrantyCovered: false,
      record: { fileType: null, syncStatus: 'CONFIRMED', matchesOnchain: true },
    });
    const counts = (await ticketList(center, 'CLOSED')).counts;
    expect(counts).toEqual({ REQUESTED: 0, IN_REPAIR: 0, CLOSED: 2 });
  });

  it('sửa biên bản trong CSDL thì không còn khớp hash on-chain; đóng phiếu bằng hash lạ thì cảnh báo', async () => {
    const record = await prisma.serviceRecord.findFirstOrThrow({
      where: {
        serviceRequest: { productId: productIds[SERIAL_NO_WARRANTY] },
        syncStatus: 'CONFIRMED',
      },
    });
    await prisma.serviceRecord.update({
      where: { id: record.id },
      data: { actionDetail: 'Đã sửa xong' },
    });
    expect((await ticket(record.serviceRequestId)).record?.matchesOnchain).toBe(false);
    await prisma.serviceRecord.update({
      where: { id: record.id },
      data: { actionDetail: record.actionDetail },
    });

    // Trung tâm tự gọi closeTicket với hash không do hệ thống lưu (không qua web).
    const created = await requestService(SERIAL_COVERED, 'Loa rè');
    const auth = await openTicket(created.id);
    await sendTicket(
      centerWallet,
      'closeTicket',
      [auth.ticketId, true, `0x${'ee'.repeat(32)}`],
      null,
    );
    expect(await ticket(created.id)).toMatchObject({ state: 'REPAIRED', record: null });
    const alerts = await prisma.anomalyAlert.findMany({ select: { ruleCode: true } });
    expect(alerts.map((alert) => alert.ruleCode)).toEqual(['SERVICE_EVIDENCE_MISMATCH']);
  });
});
