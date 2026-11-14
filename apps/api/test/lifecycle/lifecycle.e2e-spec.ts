import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type MyInventory,
  type MyNotifications,
  type MyProductList,
  type MyTransfers,
  type NotificationSummary,
  type OrganizationApplicationAuthorization,
  type OwnedProductLifecycle,
  OWNERSHIP_TRANSFER_ABI,
  PARTY_REGISTRY_ABI,
  partyIdFromUuid,
  PRODUCT_LIFECYCLE_ABI,
  PRODUCT_PASSPORT_ABI,
  type ProductRegistrationAuthorization,
  type ProductSaleAuthorization,
  type PublicLifecycleView,
  type PublicPassportView,
  type RecallAuthorizationView,
  recallReasonHash,
  SERVICE_TICKET_MANAGER_ABI,
  type ServiceTicketOpeningAuthorization,
  type TransferRequestAuthorization,
} from '@dpp/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TestingModule } from '@nestjs/testing';
import { Contract, type JsonRpcSigner, Wallet } from 'ethers';
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
const REASON =
  'Bo nguồn có thể quá nhiệt khi dùng liên tục trên 6 giờ. Ngừng sử dụng và mang tới cửa hàng.';
const SERIAL = {
  atShop: 'LT14-2611-00001',
  sold: 'LT14-2611-00002',
  shipping: 'LT14-2611-00003',
  lost: 'LT14-2611-00004',
  repair: 'LT14-2611-00005',
  retire: 'LT14-2611-00006',
} as const;
const SOLD_SERIALS = [SERIAL.sold, SERIAL.lost, SERIAL.repair, SERIAL.retire];

function lifecycleReport(agent: TestAgent) {
  return { agent, path: '/api/v1/me/lifecycle/transactions' };
}

async function notificationsOf(agent: TestAgent): Promise<MyNotifications> {
  return (await agent.get('/api/v1/me/notifications?pageSize=50').expect(200)).body;
}

/**
 * M10 trọn luồng trên Hardhat node: nhà sản xuất thu hồi một lô ở nhiều giai đoạn (RCL-01), chủ sở
 * hữu báo mất và ngừng sử dụng (LIF-01, LIF-02), cảnh báo trên hộ chiếu công khai, thông báo trong
 * ứng dụng cho các bên.
 */
describe('RCL-01, LIF-01, LIF-02: thu hồi, báo mất, ngừng sử dụng (e2e, Hardhat node)', () => {
  let chain: LocalChain;
  let api: NestExpressApplication;
  let worker: TestingModule;
  let prisma: PrismaClient;
  let uploadDir: string;
  let registry: Contract;
  let passport: Contract;
  let tickets: Contract;
  let transfers: Contract;
  let lifecycle: Contract;
  let adminWallet: JsonRpcSigner;
  let makerWallet: JsonRpcSigner;
  let shopWallet: JsonRpcSigner;
  let centerWallet: JsonRpcSigner;
  let ownerWallet: JsonRpcSigner;
  let receiverWallet: JsonRpcSigner;
  let maker: TestAgent;
  let shop: TestAgent;
  let center: TestAgent;
  let owner: TestAgent;
  let receiver: TestAgent;
  let visitor: TestAgent;
  let shopOrgId: string;
  let centerOrgId: string;
  const productIds: Record<string, string> = {};
  const chainIds: Record<string, string> = {};
  let deployBlockNumber = 0n;
  const publicCodes: Record<string, string> = {};

  async function register(email: string, fullName: string): Promise<TestAgent> {
    const agent = request.agent(api.getHttpServer());
    await agent
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, fullName })
      .expect(201);
    return agent;
  }

  /** Worker chốt giao dịch đã báo và quét log của cả 5 contract tới block hiện tại. */
  async function sync(): Promise<void> {
    await worker.get(ConfirmTransactions).runOnce();
    const indexer = worker.get(IndexChainEvents);
    const head = BigInt(await chain.provider.send('eth_blockNumber', []));
    for (let round = 0; round < 20; round += 1) {
      await indexer.runOnce();
      const checkpoints = await prisma.indexerCheckpoint.findMany();
      if (
        checkpoints.length === 6 &&
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
    return (await prisma.organization.findFirstOrThrow({ where: { taxCode: profile.taxCode } })).id;
  }

  /** Ví gửi giao dịch; `report` là đường báo txHash (web làm sau khi MetaMask gửi). */
  async function send(
    contract: Contract,
    wallet: JsonRpcSigner,
    method: string,
    args: unknown[],
    report: { agent: TestAgent; path: string } | null = null,
  ): Promise<string> {
    const tx = await contract.connect(wallet).getFunction(method)(...args);
    await tx.wait();
    if (report) {
      await report.agent.post(report.path).send({ txHash: tx.hash }).expect(202);
    }
    await sync();
    return tx.hash;
  }

  async function ownedLifecycle(agent: TestAgent, serial: string): Promise<OwnedProductLifecycle> {
    return (
      await agent.get(`/api/v1/me/owned-products/${productIds[serial]}/lifecycle`).expect(200)
    ).body;
  }

  async function publicNotice(serial: string): Promise<PublicLifecycleView> {
    return (
      await visitor.get(`/api/v1/public/products/${publicCodes[serial]}/lifecycle`).expect(200)
    ).body;
  }

  beforeAll(async () => {
    prisma = createTestPrisma();
    await resetDatabase(prisma);
    uploadDir = await mkdtemp(join(tmpdir(), 'dpp-lifecycle-'));
    chain = await startHardhatNode();
    [adminWallet, makerWallet, shopWallet, centerWallet, ownerWallet, receiverWallet] =
      await Promise.all([
        chain.signer(0),
        chain.signer(2),
        chain.signer(3),
        chain.signer(4),
        chain.signer(5),
        chain.signer(6),
      ]);
    const registryAddress = await chain.deployPartyRegistry(
      new Wallet(TEST_REGISTRAR_KEY).address,
      { registrationFee: 0n },
    );
    const contracts = await chain.deployProductContracts(registryAddress);
    const ticketAddress = await chain.deployServiceTicketManager({
      partyRegistry: registryAddress,
      ...contracts,
    });
    const transferAddress = await chain.deployOwnershipTransfer({
      partyRegistry: registryAddress,
      productPassport: contracts.productPassport,
      serviceTicketManager: ticketAddress,
    });
    const lifecycleAddress = await chain.deployProductLifecycle({
      partyRegistry: registryAddress,
      productPassport: contracts.productPassport,
      serviceTicketManager: ticketAddress,
    });
    registry = new Contract(registryAddress, PARTY_REGISTRY_ABI, chain.provider);
    passport = new Contract(contracts.productPassport, PRODUCT_PASSPORT_ABI, chain.provider);
    tickets = new Contract(ticketAddress, SERVICE_TICKET_MANAGER_ABI, chain.provider);
    transfers = new Contract(transferAddress, OWNERSHIP_TRANSFER_ABI, chain.provider);
    lifecycle = new Contract(lifecycleAddress, PRODUCT_LIFECYCLE_ABI, chain.provider);
    const deployBlock = String(await chain.provider.getBlockNumber());
    deployBlockNumber = BigInt(deployBlock);
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
      SERVICE_TICKET_MANAGER_ADDRESS: ticketAddress,
      SERVICE_TICKET_MANAGER_DEPLOY_BLOCK: deployBlock,
      OWNERSHIP_TRANSFER_ADDRESS: transferAddress,
      OWNERSHIP_TRANSFER_DEPLOY_BLOCK: deployBlock,
      PRODUCT_LIFECYCLE_ADDRESS: lifecycleAddress,
      PRODUCT_LIFECYCLE_DEPLOY_BLOCK: deployBlock,
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
    center = await register('kythuat@baohanh.vn', 'Kỹ thuật viên');
    owner = await register('nguyen.an@gmail.com', 'Nguyễn Văn An');
    receiver = await register('le.binh@gmail.com', 'Lê Thị Bình');
    for (const [agent, wallet] of [
      [maker, makerWallet],
      [shop, shopWallet],
      [center, centerWallet],
      [owner, ownerWallet],
      [receiver, receiverWallet],
    ] as const) {
      await linkWallet(agent, wallet);
    }
    await approvedOrganization(maker, makerWallet, {
      name: 'Công ty TNHH Điện tử An Phát',
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
      name: 'Trung tâm Bảo hành An Phát',
      taxCode: '0315556667',
      orgType: 'SERVICE_CENTER',
      address: '45 Lý Thường Kiệt, Quận 10, TP. Hồ Chí Minh',
    });

    const items = Object.values(SERIAL).map((serialNumber) => ({
      serialNumber,
      warrantyMonths: 24,
      modelName: 'Laptop An Phát 14',
      description: null,
      manufacturedOn: '2026-10-20',
    }));
    const registration: ProductRegistrationAuthorization = (
      await maker.post('/api/v1/me/products/registrations').send({ items }).expect(201)
    ).body;
    await send(passport, makerWallet, 'registerProducts', [
      registration.issuerId,
      registration.productIds,
      registration.metadataHashes,
      registration.warrantyMonths,
      BigInt(registration.deadline),
      registration.signature,
    ]);
    for (const [index, created] of registration.products.entries()) {
      productIds[created.serialNumber] = created.id;
      publicCodes[created.serialNumber] = created.publicCode;
      chainIds[created.serialNumber] = registration.productIds[index] ?? '';
    }
    for (const serial of Object.values(SERIAL)) {
      await send(passport, makerWallet, 'dispatchCustody', [
        chainIds[serial],
        partyIdFromUuid(shopOrgId),
      ]);
      if (serial === SERIAL.shipping) {
        continue;
      }
      await send(passport, shopWallet, 'confirmCustodyReceipt', [chainIds[serial]]);
      if (!(SOLD_SERIALS as string[]).includes(serial)) {
        continue;
      }
      const sale: ProductSaleAuthorization = (
        await shop
          .post(`/api/v1/me/inventory/${productIds[serial]}/sale-authorizations`)
          .send({ buyerEmail: 'nguyen.an@gmail.com' })
          .expect(201)
      ).body;
      await send(passport, shopWallet, 'sellAndActivateWarranty', [
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

  it('thông báo M6, M9: nhà bán lẻ được báo khi có hàng gửi tới; bên nhận được báo yêu cầu chuyển nhượng', async () => {
    const shopInbox = await notificationsOf(shop);
    expect(shopInbox.items.filter((item) => item.type === 'CUSTODY_DISPATCHED')).toHaveLength(6);
    expect(shopInbox.items[0]).toMatchObject({
      organizationName: 'Công ty TNHH Điện tử An Phát',
      product: { modelName: 'Laptop An Phát 14' },
      readAt: null,
    });

    const auth: TransferRequestAuthorization = (
      await owner
        .post(`/api/v1/me/owned-products/${productIds[SERIAL.sold]}/transfer-authorizations`)
        .send({ recipient: 'le.binh@gmail.com', days: 7 })
        .expect(201)
    ).body;
    await send(
      transfers,
      ownerWallet,
      'createTransferRequest',
      [
        auth.productId,
        auth.toPartyId,
        BigInt(auth.expiresAt),
        BigInt(auth.deadline),
        auth.signature,
      ],
      { agent: owner, path: '/api/v1/me/transfers/transactions' },
    );
    expect((await notificationsOf(receiver)).items.map((item) => item.type)).toEqual([
      'TRANSFER_REQUESTED',
    ]);
  });

  it('RCL-01: thu hồi một lô ở cửa hàng, đã bán, đang giao; báo các bên, huỷ yêu cầu đang chờ', async () => {
    const pending: { id: string } = (
      await owner
        .post(`/api/v1/me/owned-products/${productIds[SERIAL.sold]}/service-requests`)
        .send({ serviceCenterOrgId: centerOrgId, issueDesc: 'Máy nóng bất thường' })
        .expect(201)
    ).body;
    const batch = [SERIAL.atShop, SERIAL.sold, SERIAL.shipping];
    await maker
      .post('/api/v1/me/products/recall-authorizations')
      .send({ productIds: [productIds[SERIAL.atShop]], reason: 'ngắn' })
      .expect(400);
    await shop
      .post('/api/v1/me/products/recall-authorizations')
      .send({ productIds: [productIds[SERIAL.atShop]], reason: REASON })
      .expect(403);

    const auth: RecallAuthorizationView = (
      await maker
        .post('/api/v1/me/products/recall-authorizations')
        .send({ productIds: batch.map((serial) => productIds[serial]), reason: REASON })
        .expect(201)
    ).body;
    expect(auth).toMatchObject({
      method: 'recallProducts',
      productIds: batch.map((serial) => chainIds[serial]),
      reasonHash: recallReasonHash(REASON),
    });
    const txHash = await send(
      lifecycle,
      makerWallet,
      'recallProducts',
      [auth.productIds, auth.reasonHash, BigInt(auth.deadline), auth.signature],
      lifecycleReport(maker),
    );

    const rows = await prisma.product.findMany({
      where: { id: { in: batch.map((serial) => productIds[serial] ?? '') } },
    });
    expect(rows.map((row) => row.productState)).toEqual(['RECALLED', 'RECALLED', 'RECALLED']);
    expect(rows.every((row) => row.pendingCustodianPartyId === null)).toBe(true);
    const recalls = await prisma.recall.findMany();
    expect(recalls.map((row) => [row.syncStatus, row.txHash, row.reason])).toEqual(
      batch.map(() => ['CONFIRMED', txHash, REASON]),
    );
    expect(
      (await prisma.serviceRequest.findUniqueOrThrow({ where: { id: pending.id } })).serviceState,
    ).toBe('CANCELLED');

    const notice = await publicNotice(SERIAL.sold);
    expect(notice.notice).toMatchObject({
      state: 'RECALLED',
      txHash,
      recall: { reason: REASON, issuerName: 'Công ty TNHH Điện tử An Phát' },
    });
    const passportView: PublicPassportView = (
      await visitor.get(`/api/v1/public/products/${publicCodes[SERIAL.sold]}`).expect(200)
    ).body;
    expect(passportView.productState).toBe('RECALLED');
    expect(passportView.journey.at(-1)).toMatchObject({ kind: 'RECALLED', txHash });
    expect(JSON.stringify(notice)).not.toMatch(/Nguyễn Văn An|gmail/);

    const ownerInbox = await notificationsOf(owner);
    expect(ownerInbox.items[0]).toMatchObject({
      type: 'PRODUCT_RECALLED',
      reason: REASON,
      product: { serialNumber: SERIAL.sold },
    });
    const shopRecalls = (await notificationsOf(shop)).items.filter(
      (item) => item.type === 'PRODUCT_RECALLED',
    );
    expect(shopRecalls.map((item) => item.product.serialNumber).toSorted()).toEqual(
      [SERIAL.atShop, SERIAL.shipping].toSorted(),
    );
    expect((await notificationsOf(maker)).items).toHaveLength(0);

    const stock: MyInventory = (await shop.get('/api/v1/me/inventory?filter=IN_STOCK').expect(200))
      .body;
    expect(stock.items.find((item) => item.serialNumber === SERIAL.atShop)?.productState).toBe(
      'RECALLED',
    );
    const list: MyProductList = (await maker.get('/api/v1/me/products?filter=RECALLED').expect(200))
      .body;
    expect(list.counts.RECALLED).toBe(3);
    expect(list.items).toHaveLength(3);

    expect(
      (
        await maker
          .post('/api/v1/me/products/recall-authorizations')
          .send({ productIds: [productIds[SERIAL.atShop]], reason: REASON })
          .expect(409)
      ).body.code,
    ).toBe('RECALL_NOT_ALLOWED');
  });

  it('yêu cầu chuyển nhượng của sản phẩm đã thu hồi không chấp nhận được, bên gửi vẫn huỷ được', async () => {
    const incoming: MyTransfers = (
      await receiver.get('/api/v1/me/transfers?filter=INCOMING').expect(200)
    ).body;
    const [item] = incoming.items;
    expect(item).toMatchObject({ state: 'REQUESTED', productUnavailable: true });
    // ProductPassport từ chối đổi chủ (InvalidStateTransition, selector 0x6b46fcbe).
    await expect(
      transfers
        .connect(receiverWallet)
        .getFunction('acceptTransfer')
        .staticCall(BigInt(item?.requestId ?? 0)),
    ).rejects.toMatchObject({ data: expect.stringMatching(/^0x6b46fcbe/) });
    await send(transfers, ownerWallet, 'cancelTransfer', [BigInt(item?.requestId ?? 0)], {
      agent: owner,
      path: '/api/v1/me/transfers/transactions',
    });
    expect(
      (await receiver.get('/api/v1/me/transfers?filter=INCOMING').expect(200)).body.total,
    ).toBe(0);
  });

  it('LIF-01: chủ sở hữu báo mất; trạng thái cuối, nhà sản xuất không thu hồi được nữa', async () => {
    expect(await ownedLifecycle(owner, SERIAL.lost)).toMatchObject({
      notice: null,
      blockedReason: null,
      chainProductId: chainIds[SERIAL.lost],
      methods: ['reportLostStolen', 'retireProduct'],
    });
    await receiver
      .get(`/api/v1/me/owned-products/${productIds[SERIAL.lost]}/lifecycle`)
      .expect(404);
    await shop.get(`/api/v1/me/owned-products/${productIds[SERIAL.lost]}/lifecycle`).expect(404);
    await expect(
      lifecycle
        .connect(receiverWallet)
        .getFunction('reportLostStolen')
        .staticCall(chainIds[SERIAL.lost]),
    ).rejects.toThrow(/NotProductOwner/);

    const txHash = await send(
      lifecycle,
      ownerWallet,
      'reportLostStolen',
      [chainIds[SERIAL.lost]],
      lifecycleReport(owner),
    );
    const view = await ownedLifecycle(owner, SERIAL.lost);
    expect(view.notice).toMatchObject({ state: 'LOST_STOLEN', txHash, recall: null });
    expect(view.blockedReason).toMatch(/trạng thái cuối/);
    expect((await publicNotice(SERIAL.lost)).notice).toMatchObject({
      state: 'LOST_STOLEN',
      txHash,
    });
    expect(
      (
        await maker
          .post('/api/v1/me/products/recall-authorizations')
          .send({ productIds: [productIds[SERIAL.lost]], reason: REASON })
          .expect(409)
      ).body.message,
    ).toMatch(/đã được báo mất/);
  });

  it('đang có phiếu sửa mở thì chưa báo mất, ngừng sử dụng được; LIF-02 ngừng sử dụng', async () => {
    const serviceRequest: { id: string } = (
      await owner
        .post(`/api/v1/me/owned-products/${productIds[SERIAL.repair]}/service-requests`)
        .send({ serviceCenterOrgId: centerOrgId, issueDesc: 'Bàn phím liệt phím' })
        .expect(201)
    ).body;
    const opening: ServiceTicketOpeningAuthorization = (
      await center
        .post(`/api/v1/me/service-tickets/${serviceRequest.id}/opening-authorizations`)
        .expect(201)
    ).body;
    await send(tickets, centerWallet, 'openTicket', [
      opening.ticketId,
      opening.productId,
      opening.requesterId,
      BigInt(opening.deadline),
      opening.signature,
    ]);
    expect((await ownedLifecycle(owner, SERIAL.repair)).blockedReason).toMatch(/phiếu sửa chữa/);
    await expect(
      lifecycle
        .connect(ownerWallet)
        .getFunction('retireProduct')
        .staticCall(chainIds[SERIAL.repair]),
    ).rejects.toThrow(/ProductUnderRepair/);

    const txHash = await send(
      lifecycle,
      ownerWallet,
      'retireProduct',
      [chainIds[SERIAL.retire]],
      lifecycleReport(owner),
    );
    expect((await ownedLifecycle(owner, SERIAL.retire)).notice).toMatchObject({
      state: 'RETIRED',
      txHash,
    });
    const passportView: PublicPassportView = (
      await visitor.get(`/api/v1/public/products/${publicCodes[SERIAL.retire]}`).expect(200)
    ).body;
    expect(passportView.journey.at(-1)).toMatchObject({
      kind: 'RETIRED',
      from: { kind: 'PERSON', isYou: false },
    });
  });

  it('đọc thông báo: số chưa đọc, đánh dấu một hoặc tất cả; không có cảnh báo bất thường', async () => {
    const inbox = await notificationsOf(owner);
    const summary: NotificationSummary = (
      await owner.get('/api/v1/me/notifications/summary').expect(200)
    ).body;
    expect(summary.unread).toBe(inbox.unread);
    expect(inbox.items.map((item) => item.type)).toEqual(
      expect.arrayContaining(['PRODUCT_RECALLED', 'SERVICE_TICKET_OPENED']),
    );
    const first = inbox.items[0]?.id ?? '';
    expect(
      (
        await owner
          .post('/api/v1/me/notifications/read')
          .send({ ids: [first] })
          .expect(200)
      ).body,
    ).toEqual({ unread: inbox.unread - 1 });
    expect((await owner.post('/api/v1/me/notifications/read').send({}).expect(200)).body).toEqual({
      unread: 0,
    });
    await receiver
      .post('/api/v1/me/notifications/read')
      .send({ ids: [first] })
      .expect(200);
    expect((await notificationsOf(owner)).items[0]?.readAt).not.toBeNull();
    await visitor.get('/api/v1/me/notifications').expect(401);
    expect(await prisma.anomalyAlert.count()).toBe(0);
  });
  /** Trạng thái mọi bảng do Indexer chiếu (không gồm mốc quét). */
  const rows = (sql: string) => prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql);

  async function projectedState() {
    return {
      events: await rows(
        'SELECT tx_hash, log_index, finality_status, block_hash FROM blockchain_events ORDER BY tx_hash, log_index',
      ),
      products: await rows(
        'SELECT id, product_state, current_custodian_party_id, pending_custodian_party_id, current_owner_party_id FROM products ORDER BY id',
      ),
      warranties: await rows(
        'SELECT product_id, warranty_state, expires_at FROM warranties ORDER BY product_id',
      ),
      service: await rows('SELECT id, service_state FROM service_requests ORDER BY id'),
      transfers: await rows('SELECT id, transfer_state FROM transfer_requests ORDER BY id'),
      counts: await rows(
        `SELECT (SELECT count(*) FROM audit_logs)::int AS audit,
                (SELECT count(*) FROM notifications)::int AS notifications,
                (SELECT count(*) FROM custody_records)::int AS custody,
                (SELECT count(*) FROM ownership_records)::int AS ownership,
                (SELECT count(*) FROM recalls)::int AS recalls,
                (SELECT count(*) FROM anomaly_alerts)::int AS alerts`,
      ),
    };
  }

  it('M13: Worker quét lại từ block deploy (khôi phục sau sự cố) không tạo trùng event, nhật ký, thông báo hay lịch sử', async () => {
    const before = await projectedState();
    expect(before.events.length).toBeGreaterThan(30);

    // Như khôi phục CSDL từ bản sao lưu cũ: mốc quét của mọi contract lùi về block deploy.
    await prisma.indexerCheckpoint.updateMany({
      data: {
        lastFinalizedBlock: deployBlockNumber - 1n,
        lastObservedBlock: deployBlockNumber - 1n,
      },
    });
    await sync();

    expect(await projectedState()).toEqual(before);
    const head = BigInt(await chain.provider.send('eth_blockNumber', []));
    const checkpoints = await prisma.indexerCheckpoint.findMany();
    expect(checkpoints.every((checkpoint) => checkpoint.lastFinalizedBlock >= head)).toBe(true);
  });
});
