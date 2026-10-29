import {
  addWarrantyMonths,
  type InventoryDetail,
  type MyInventory,
  type MyWorkspace,
  type OrganizationApplicationAuthorization,
  type OwnedProduct,
  type OwnedProductDetail,
  PARTY_REGISTRY_ABI,
  PRODUCT_PASSPORT_ABI,
  type ProductDetail,
  type ProductRegistrationAuthorization,
  type ProductSaleAuthorization,
  type PublicPassportView,
  type RetailerOption,
  WARRANTY_MANAGER_ABI,
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
const AIR_PURIFIER = {
  modelName: 'Máy lọc không khí AP-500',
  description: 'Màng lọc HEPA H13, CADR 400 m³/h',
  manufacturedOn: '2026-10-15',
  warrantyMonths: 24,
};

async function inventory(agent: TestAgent, filter: string): Promise<MyInventory> {
  return (await agent.get(`/api/v1/me/inventory?filter=${filter}`).expect(200)).body;
}

/**
 * M6 trọn luồng trên Hardhat node: nhà sản xuất gửi hàng (DST-01), nhà bán lẻ từ chối hoặc nhận
 * (DST-02), nhà sản xuất huỷ khi gửi nhầm, nhà bán lẻ bán cho tài khoản chưa liên kết ví và bảo
 * hành được kích hoạt (DST-03). Mọi bước do ví cá nhân của người đại diện ký; Indexer chiếu event.
 */
describe('DST-01..03: giao hàng, nhận hàng, bán và kích hoạt bảo hành (e2e, Hardhat node)', () => {
  let chain: LocalChain;
  let api: NestExpressApplication;
  let worker: TestingModule;
  let prisma: PrismaClient;
  let registry: Contract;
  let passport: Contract;
  let warranty: Contract;
  let adminWallet: JsonRpcSigner;
  let makerWallet: JsonRpcSigner;
  let shopWallet: JsonRpcSigner;
  let otherShopWallet: JsonRpcSigner;
  let maker: TestAgent;
  let shop: TestAgent;
  let otherShop: TestAgent;
  let buyer: TestAgent;
  let visitor: TestAgent;
  let shopPartyId: string;
  let otherShopPartyId: string;
  const productIds: Record<string, string> = {};

  async function register(email: string, fullName: string): Promise<TestAgent> {
    const agent = request.agent(api.getHttpServer());
    await agent
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, fullName })
      .expect(201);
    return agent;
  }

  /** Worker chốt giao dịch đã báo và quét log của mọi contract tới block hiện tại. */
  async function sync(): Promise<void> {
    await worker.get(ConfirmTransactions).runOnce();
    const indexer = worker.get(IndexChainEvents);
    const head = BigInt(await chain.provider.send('eth_blockNumber', []));
    for (let round = 0; round < 20; round += 1) {
      await indexer.runOnce();
      const checkpoints = await prisma.indexerCheckpoint.findMany();
      if (
        checkpoints.length === 3 &&
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

  /** ORG-01 + ORG-02: nộp đơn bằng ví cá nhân, Admin duyệt; trả partyId của tổ chức. */
  async function approvedOrganization(
    agent: TestAgent,
    wallet: JsonRpcSigner,
    profile: {
      name: string;
      taxCode: string;
      orgType: 'MANUFACTURER' | 'RETAILER';
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
    return auth.partyId;
  }

  /** Ví gửi một hàm của ProductPassport, web báo txHash (nếu có `reportTo`), Worker chốt. */
  async function send(
    wallet: JsonRpcSigner,
    method: string,
    args: unknown[],
    reportTo?: { agent: TestAgent; path: string },
  ): Promise<string> {
    const tx = await passport.connect(wallet).getFunction(method)(...args);
    await tx.wait();
    if (reportTo) {
      await reportTo.agent.post(reportTo.path).send({ txHash: tx.hash }).expect(202);
    }
    await sync();
    return tx.hash;
  }

  /** Nhà sản xuất báo txHash ở /me/products, nhà bán lẻ ở /me/inventory. */
  const asMaker = () => ({ agent: maker, path: '/api/v1/me/products/transactions' });
  const asShop = () => ({ agent: shop, path: '/api/v1/me/inventory/transactions' });

  async function product(serial: string): Promise<ProductDetail> {
    return (await maker.get(`/api/v1/me/products/${productIds[serial]}`).expect(200)).body;
  }

  beforeAll(async () => {
    prisma = createTestPrisma();
    await resetDatabase(prisma);
    chain = await startHardhatNode();
    [adminWallet, makerWallet, shopWallet, otherShopWallet] = await Promise.all([
      chain.signer(0),
      chain.signer(2),
      chain.signer(3),
      chain.signer(4),
    ]);
    const registryAddress = await chain.deployPartyRegistry(
      new Wallet(TEST_REGISTRAR_KEY).address,
      {
        registrationFee: 0n,
      },
    );
    const contracts = await chain.deployProductContracts(registryAddress);
    registry = new Contract(registryAddress, PARTY_REGISTRY_ABI, chain.provider);
    passport = new Contract(contracts.productPassport, PRODUCT_PASSPORT_ABI, chain.provider);
    warranty = new Contract(contracts.warrantyManager, WARRANTY_MANAGER_ABI, chain.provider);
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
    });
    api = await createApiApp({ config });
    worker = await createWorkerContext(config);
    visitor = request.agent(api.getHttpServer());

    const admin = await register('admin@dpp.vn', 'Quản trị viên');
    await prisma.user.update({ where: { email: 'admin@dpp.vn' }, data: { systemRole: 'ADMIN' } });
    await linkWallet(admin, adminWallet);
    maker = await register('daidien@anphat.vn', 'Đại diện An Phát');
    shop = await register('daidien@saomai.vn', 'Đại diện Sao Mai');
    otherShop = await register('daidien@hoanglong.vn', 'Đại diện Hoàng Long');
    // Người mua chỉ có tài khoản web, không liên kết ví.
    buyer = await register('khach.hang@gmail.com', 'Trần Thị Khách');
    await linkWallet(maker, makerWallet);
    await linkWallet(shop, shopWallet);
    await linkWallet(otherShop, otherShopWallet);
    await approvedOrganization(maker, makerWallet, {
      name: 'Công ty TNHH Thiết bị Gia dụng An Phát',
      taxCode: '0318765432',
      orgType: 'MANUFACTURER',
      address: 'Lô C5, KCN Tân Bình, TP. Hồ Chí Minh',
    });
    shopPartyId = await approvedOrganization(shop, shopWallet, {
      name: 'Siêu thị Điện máy Sao Mai',
      taxCode: '0312345678',
      orgType: 'RETAILER',
      address: '120 Nguyễn Trãi, Quận 1, TP. Hồ Chí Minh',
    });
    otherShopPartyId = await approvedOrganization(otherShop, otherShopWallet, {
      name: 'Điện máy Hoàng Long',
      taxCode: '0309988776',
      orgType: 'RETAILER',
      address: '45 Trần Phú, Hà Đông, Hà Nội',
    });

    const items = ['AP500-2610-00001', 'AP500-2610-00002'].map((serialNumber) => ({
      ...AIR_PURIFIER,
      serialNumber,
    }));
    const response = await maker
      .post('/api/v1/me/products/registrations')
      .send({ items })
      .expect(201);
    const authorization: ProductRegistrationAuthorization = response.body;
    for (const created of authorization.products) {
      productIds[created.serialNumber] = created.id;
    }
    await send(
      makerWallet,
      'registerProducts',
      [
        authorization.issuerId,
        authorization.productIds,
        authorization.metadataHashes,
        authorization.warrantyMonths,
        BigInt(authorization.deadline),
        authorization.signature,
      ],
      asMaker(),
    );
  }, 240_000);

  afterAll(async () => {
    await api?.close();
    await worker?.close();
    await chain?.stop();
    await prisma?.$disconnect();
  });

  it('menu theo vai trò: nhà sản xuất, nhà bán lẻ, người mua chưa có gì', async () => {
    const forMaker: MyWorkspace = (await maker.get('/api/v1/me/workspace').expect(200)).body;
    const forShop: MyWorkspace = (await shop.get('/api/v1/me/workspace').expect(200)).body;
    const forBuyer: MyWorkspace = (await buyer.get('/api/v1/me/workspace').expect(200)).body;

    expect(forMaker.organization).toMatchObject({
      orgType: 'MANUFACTURER',
      authStatus: 'AUTHORIZED',
    });
    expect(forShop.organization).toMatchObject({ orgType: 'RETAILER' });
    expect(forBuyer).toEqual({ organization: null, ownedProducts: 0 });
  });

  it('DST-01: nhà sản xuất thấy danh sách nhà bán lẻ đã duyệt và gửi hàng cho Sao Mai', async () => {
    const retailers: RetailerOption[] = (await maker.get('/api/v1/me/retailers').expect(200)).body;
    expect(retailers.map((retailer) => retailer.name)).toEqual([
      'Điện máy Hoàng Long',
      'Siêu thị Điện máy Sao Mai',
    ]);
    await shop.get('/api/v1/me/retailers').expect(403);

    const target = (await product('AP500-2610-00001')).chainProductId;
    await send(makerWallet, 'dispatchCustody', [target, shopPartyId], asMaker());

    expect(await product('AP500-2610-00001')).toMatchObject({
      productState: 'IN_DISTRIBUTION',
      pendingRetailer: { name: 'Siêu thị Điện máy Sao Mai', partyId: shopPartyId },
      holder: {
        kind: 'ORGANIZATION',
        organization: { name: 'Công ty TNHH Thiết bị Gia dụng An Phát' },
      },
    });
    const incoming = await inventory(shop, 'INCOMING');
    expect(incoming.counts).toEqual({ INCOMING: 1, IN_STOCK: 0, SOLD: 0 });
    expect(incoming.items[0]).toMatchObject({
      serialNumber: 'AP500-2610-00001',
      issuer: { name: 'Công ty TNHH Thiết bị Gia dụng An Phát' },
    });
    // Nhà bán lẻ khác không thấy hàng không gửi cho mình.
    expect((await inventory(otherShop, 'INCOMING')).counts.INCOMING).toBe(0);
  });

  it('DST-02: nhà bán lẻ từ chối thì hàng về nhà sản xuất; gửi nhầm thì nhà sản xuất huỷ được', async () => {
    const target = (await product('AP500-2610-00001')).chainProductId;
    await send(shopWallet, 'rejectCustodyReceipt', [target], asShop());
    expect(await product('AP500-2610-00001')).toMatchObject({
      productState: 'CREATED',
      pendingRetailer: null,
    });
    expect((await inventory(shop, 'INCOMING')).counts.INCOMING).toBe(0);

    await send(makerWallet, 'dispatchCustody', [target, otherShopPartyId], asMaker());
    await send(makerWallet, 'cancelDispatch', [target], asMaker());
    expect((await product('AP500-2610-00001')).productState).toBe('CREATED');
    expect((await inventory(otherShop, 'INCOMING')).counts.INCOMING).toBe(0);
  });

  it('DST-02: gửi lại đúng Sao Mai, Sao Mai xác nhận nhận hàng: AT_RETAIL, Sao Mai giữ hàng', async () => {
    const target = (await product('AP500-2610-00001')).chainProductId;
    await send(makerWallet, 'dispatchCustody', [target, shopPartyId], asMaker());
    await send(shopWallet, 'confirmCustodyReceipt', [target], asShop());

    const stock = await inventory(shop, 'IN_STOCK');
    expect(stock.counts).toEqual({ INCOMING: 0, IN_STOCK: 1, SOLD: 0 });
    expect(stock.items[0]).toMatchObject({
      productState: 'AT_RETAIL',
      holder: { kind: 'ORGANIZATION', organization: { name: 'Siêu thị Điện máy Sao Mai' } },
    });
    const row = await prisma.product.findUniqueOrThrow({
      where: { id: productIds['AP500-2610-00001'] },
      include: { custodyRecords: { orderBy: { transferredAt: 'asc' } } },
    });
    expect(row.custodyRecords.map((record) => [record.fromPartyId, record.toPartyId])).toEqual([
      [null, row.issuerOrgId],
      [row.issuerOrgId, row.currentCustodianPartyId],
    ]);
  });

  it('DST-03: email chưa có tài khoản thì báo; có tài khoản thì giấy phép ghi đúng người mua', async () => {
    const id = productIds['AP500-2610-00001'];
    const missing = await shop
      .post(`/api/v1/me/inventory/${id}/sale-authorizations`)
      .send({ buyerEmail: 'chua.dang.ky@gmail.com' })
      .expect(404);
    expect(missing.body.code).toBe('BUYER_NOT_FOUND');
    await otherShop
      .post(`/api/v1/me/inventory/${id}/sale-authorizations`)
      .send({ buyerEmail: 'khach.hang@gmail.com' })
      .expect(404);
    const notInStock = await shop
      .post(`/api/v1/me/inventory/${productIds['AP500-2610-00002']}/sale-authorizations`)
      .send({ buyerEmail: 'khach.hang@gmail.com' })
      .expect(404);
    expect(notInStock.body.code).toBe('PRODUCT_NOT_FOUND');

    const response = await shop
      .post(`/api/v1/me/inventory/${id}/sale-authorizations`)
      .send({ buyerEmail: 'Khach.Hang@gmail.com' })
      .expect(201);
    const sale: ProductSaleAuthorization = response.body;
    expect(sale.buyer).toEqual({ fullName: 'Trần Thị Khách', maskedEmail: 'k***@gmail.com' });
    expect(sale.warrantyMonths).toBe(24);

    const txHash = await send(
      shopWallet,
      'sellAndActivateWarranty',
      [sale.productId, sale.buyerId, BigInt(sale.deadline), sale.signature],
      asShop(),
    );

    const receipt = await chain.provider.getTransactionReceipt(txHash);
    const block = await chain.provider.getBlock(receipt!.blockNumber);
    const soldAt = new Date(block!.timestamp * 1000);
    const owned: OwnedProduct[] = (await buyer.get('/api/v1/me/owned-products').expect(200)).body;
    expect(owned).toHaveLength(1);
    expect(owned[0]).toMatchObject({
      serialNumber: 'AP500-2610-00001',
      productState: 'SOLD',
      holder: { kind: 'PERSON', isYou: true },
      issuer: { name: 'Công ty TNHH Thiết bị Gia dụng An Phát' },
      acquiredAt: soldAt.toISOString(),
      warranty: {
        state: 'ACTIVE',
        months: 24,
        activatedAt: soldAt.toISOString(),
        expiresAt: addWarrantyMonths(soldAt, 24).toISOString(),
        activatedBy: { name: 'Siêu thị Điện máy Sao Mai' },
        activationTxHash: txHash,
      },
    });
    expect(Number(await warranty.getFunction('effectiveWarrantyState')(sale.productId))).toBe(1);
    expect((await inventory(shop, 'SOLD')).items[0]).toMatchObject({
      serialNumber: 'AP500-2610-00001',
      soldAt: soldAt.toISOString(),
    });
  });

  it('người mua xem chi tiết có hành trình đủ các bước; người khác không xem được', async () => {
    const id = productIds['AP500-2610-00001'];
    const detail: OwnedProductDetail = (
      await buyer.get(`/api/v1/me/owned-products/${id}`).expect(200)
    ).body;

    expect(detail.journey.map((step) => step.kind)).toEqual([
      'REGISTERED',
      'DISPATCHED',
      'DISPATCH_REJECTED',
      'DISPATCHED',
      'DISPATCH_CANCELLED',
      'DISPATCHED',
      'RECEIVED',
      'SOLD',
      'WARRANTY_ACTIVATED',
    ]);
    expect(detail.journey.at(-2)).toMatchObject({
      from: { kind: 'ORGANIZATION', organization: { name: 'Siêu thị Điện máy Sao Mai' } },
      to: { kind: 'PERSON', isYou: true },
    });
    expect(detail.proof).toMatchObject({ onchainMatches: true, metadataMatchesHash: true });
    await shop.get(`/api/v1/me/owned-products/${id}`).expect(404);

    const shopView: InventoryDetail = (await shop.get(`/api/v1/me/inventory/${id}`).expect(200))
      .body;
    expect(shopView.journey.at(-2)?.to).toEqual({ kind: 'PERSON', isYou: false });
  });

  it('hộ chiếu công khai: đã có chủ, còn bảo hành, hành trình có txHash; không lộ người mua', async () => {
    const row = await prisma.product.findUniqueOrThrow({
      where: { id: productIds['AP500-2610-00001'] },
    });
    const response = await visitor.get(`/api/v1/public/products/${row.publicCode}`).expect(200);
    const view: PublicPassportView = response.body;

    expect(view).toMatchObject({
      productState: 'SOLD',
      hasOwner: true,
      holder: { kind: 'PERSON', isYou: false },
      pendingRetailer: null,
      warranty: { state: 'ACTIVE', months: 24 },
      proof: { onchainMatches: true },
    });
    expect(view.journey.every((step) => /^0x[0-9a-f]{64}$/.test(step.txHash))).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/khach\.hang|Trần Thị Khách/);
    expect(view.history.map((event) => event.eventName)).toContain('WarrantyActivated');
  });

  it('báo txHash sai vai trò thì từ chối: nhà bán lẻ không báo giao dịch của nhà sản xuất', async () => {
    const target = (await product('AP500-2610-00002')).chainProductId;
    const tx = await passport.connect(makerWallet).getFunction('dispatchCustody')(
      target,
      shopPartyId,
    );
    await tx.wait();

    await shop.post('/api/v1/me/inventory/transactions').send({ txHash: tx.hash }).expect(422);
    await maker.post('/api/v1/me/products/transactions').send({ txHash: tx.hash }).expect(202);
    await sync();
    expect((await product('AP500-2610-00002')).productState).toBe('IN_DISTRIBUTION');
    expect(await prisma.anomalyAlert.findMany({ select: { ruleCode: true } })).toEqual([]);
  });
});
