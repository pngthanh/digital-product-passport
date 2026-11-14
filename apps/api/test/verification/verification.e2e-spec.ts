import {
  type OrganizationApplicationAuthorization,
  PARTY_REGISTRY_ABI,
  partyIdFromUuid,
  PRODUCT_PASSPORT_ABI,
  type ProductRegistrationAuthorization,
  type ProductSaleAuthorization,
  type PublicPassportView,
  type PublicVerificationView,
  toChecksumAddress,
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
const SERIAL = {
  sold: 'TV55-2611-00001',
  atShop: 'TV55-2611-00002',
  shipping: 'TV55-2611-00003',
  fresh: 'TV55-2611-00004',
} as const;

/**
 * M11 trên Hardhat node: VER-01 đối chiếu hộ chiếu công khai với contract tại block Indexer đã chốt
 * (khớp, đang cập nhật, lệch và cảnh báo Admin); VER-02 lịch sử công khai không lộ người mua.
 */
describe('VER-01, VER-02: đối chiếu hộ chiếu công khai (e2e, Hardhat node)', () => {
  let chain: LocalChain;
  let api: NestExpressApplication;
  let worker: TestingModule;
  let prisma: PrismaClient;
  let registry: Contract;
  let passport: Contract;
  let productPassportAddress: string;
  let adminWallet: JsonRpcSigner;
  let makerWallet: JsonRpcSigner;
  let shopWallet: JsonRpcSigner;
  let buyerWallet: JsonRpcSigner;
  let maker: TestAgent;
  let shop: TestAgent;
  let visitor: TestAgent;
  let shopOrgId: string;
  const productIds: Record<string, string> = {};
  const chainIds: Record<string, string> = {};
  const publicCodes: Record<string, string> = {};

  async function register(email: string, fullName: string): Promise<TestAgent> {
    const agent = request.agent(api.getHttpServer());
    await agent
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, fullName })
      .expect(201);
    return agent;
  }

  /** Worker chốt giao dịch đã báo và quét log tới block hiện tại. */
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
    const auth: OrganizationApplicationAuthorization = (
      await agent
        .post('/api/v1/me/organization/application')
        .send({ ...profile, contactEmail: `lienhe@${profile.taxCode}.vn` })
        .expect(201)
    ).body;
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

  async function send(wallet: JsonRpcSigner, method: string, args: unknown[]): Promise<string> {
    const tx = await passport.connect(wallet).getFunction(method)(...args);
    await tx.wait();
    return tx.hash;
  }

  async function saleAuthorization(serial: string): Promise<ProductSaleAuthorization> {
    return (
      await shop
        .post(`/api/v1/me/inventory/${productIds[serial]}/sale-authorizations`)
        .send({ buyerEmail: 'tran.mai@gmail.com' })
        .expect(201)
    ).body;
  }

  async function verification(serial: string): Promise<PublicVerificationView> {
    return (
      await visitor.get(`/api/v1/public/products/${publicCodes[serial]}/verification`).expect(200)
    ).body;
  }

  beforeAll(async () => {
    prisma = createTestPrisma();
    await resetDatabase(prisma);
    chain = await startHardhatNode();
    [adminWallet, makerWallet, shopWallet, buyerWallet] = await Promise.all([
      chain.signer(0),
      chain.signer(2),
      chain.signer(3),
      chain.signer(4),
    ]);
    const registryAddress = await chain.deployPartyRegistry(
      new Wallet(TEST_REGISTRAR_KEY).address,
      { registrationFee: 0n },
    );
    const contracts = await chain.deployProductContracts(registryAddress);
    productPassportAddress = contracts.productPassport;
    registry = new Contract(registryAddress, PARTY_REGISTRY_ABI, chain.provider);
    passport = new Contract(contracts.productPassport, PRODUCT_PASSPORT_ABI, chain.provider);
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
    maker = await register('daidien@hoaphat.vn', 'Đại diện Hoà Phát');
    shop = await register('daidien@thienhoa.vn', 'Đại diện Thiên Hoà');
    const buyer = await register('tran.mai@gmail.com', 'Trần Thị Mai');
    for (const [agent, wallet] of [
      [maker, makerWallet],
      [shop, shopWallet],
      [buyer, buyerWallet],
    ] as const) {
      await linkWallet(agent, wallet);
    }
    await approvedOrganization(maker, makerWallet, {
      name: 'Công ty Điện tử Hoà Phát',
      taxCode: '0319876543',
      orgType: 'MANUFACTURER',
      address: 'KCN Sóng Thần, Bình Dương',
    });
    shopOrgId = await approvedOrganization(shop, shopWallet, {
      name: 'Điện máy Thiên Hoà',
      taxCode: '0314567890',
      orgType: 'RETAILER',
      address: '95 Cách Mạng Tháng 8, Quận 3, TP. Hồ Chí Minh',
    });

    const items = Object.values(SERIAL).map((serialNumber) => ({
      serialNumber,
      warrantyMonths: 12,
      modelName: 'Tivi Hoà Phát 55 inch',
      description: 'Màn hình 4K, bảo hành tại nhà',
      manufacturedOn: '2026-10-25',
    }));
    const registration: ProductRegistrationAuthorization = (
      await maker.post('/api/v1/me/products/registrations').send({ items }).expect(201)
    ).body;
    await send(makerWallet, 'registerProducts', [
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
      await send(makerWallet, 'dispatchCustody', [chainIds[serial], partyIdFromUuid(shopOrgId)]);
      if (serial !== SERIAL.shipping) {
        await send(shopWallet, 'confirmCustodyReceipt', [chainIds[serial]]);
      }
    }
    await sync();
    const sale = await saleAuthorization(SERIAL.sold);
    await send(shopWallet, 'sellAndActivateWarranty', [
      sale.productId,
      sale.buyerId,
      BigInt(sale.deadline),
      sale.signature,
    ]);
    await sync();
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    await worker?.close();
    await chain?.stop();
    await prisma?.$disconnect();
  });

  it('VER-01: sản phẩm đã bán khớp blockchain ở mọi mục; trả địa chỉ contract để tự kiểm', async () => {
    const view = await verification(SERIAL.sold);
    const checkpoint = await prisma.indexerCheckpoint.findFirstOrThrow({
      where: { contractAddress: productPassportAddress.toLowerCase() },
    });

    expect(view.status).toBe('MATCH');
    expect(view.checks.every((check) => check.status === 'MATCH')).toBe(true);
    expect(view.atBlock).toBe(checkpoint.lastFinalizedBlock.toString());
    expect(view.onchain).toMatchObject({
      productState: 'SOLD',
      issuerStatus: 'AUTHORIZED',
      holder: { kind: 'PERSON', isYou: false },
      hasOwner: true,
      warrantyState: 'ACTIVE',
    });
    expect(view.contracts).toMatchObject({
      chainId: 31337,
      productPassport: toChecksumAddress(productPassportAddress),
    });
  });

  it('VER-01: hàng đang giao có nhà bán lẻ sắp nhận (kèm partyId để tự kiểm), vẫn khớp', async () => {
    const view = await verification(SERIAL.shipping);
    const page: PublicPassportView = (
      await visitor.get(`/api/v1/public/products/${publicCodes[SERIAL.shipping]}`).expect(200)
    ).body;

    expect(view.status).toBe('MATCH');
    expect(view.onchain?.pendingRetailer).toEqual({
      name: 'Điện máy Thiên Hoà',
      partyId: partyIdFromUuid(shopOrgId),
    });
    expect(page.pendingRetailer).toEqual(view.onchain?.pendingRetailer);
  });

  it('VER-02: lịch sử công khai giữ ví nhà sản xuất, nhà bán lẻ; không có mã bên của người mua', async () => {
    const page: PublicPassportView = (
      await visitor.get(`/api/v1/public/products/${publicCodes[SERIAL.sold]}`).expect(200)
    ).body;
    const buyerParty = await prisma.party.findFirstOrThrow({
      where: { user: { email: 'tran.mai@gmail.com' } },
    });

    expect(JSON.stringify(page.history).toLowerCase()).not.toContain(
      partyIdFromUuid(buyerParty.id).toLowerCase().slice(2),
    );
    const actors = new Map(page.history.map((event) => [event.eventName, event.actorAddress]));
    expect(actors.get('ProductRegistered')).toBe(toChecksumAddress(await makerWallet.getAddress()));
    expect(actors.get('OwnershipTransferred')).toBe(
      toChecksumAddress(await shopWallet.getAddress()),
    );
    expect(page.journey.map((step) => step.kind)).toContain('SOLD');
  });

  it('VER-01: giao dịch mới chiếu sau mốc Indexer thì báo đang cập nhật, không kết luận lệch', async () => {
    const sale = await saleAuthorization(SERIAL.fresh);
    const txHash = await send(shopWallet, 'sellAndActivateWarranty', [
      sale.productId,
      sale.buyerId,
      BigInt(sale.deadline),
      sale.signature,
    ]);
    await shop.post('/api/v1/me/inventory/transactions').send({ txHash }).expect(202);
    // Chỉ chốt giao dịch web đã báo (như web gửi xong), Indexer chưa quét tới.
    const stateOf = async () =>
      (await prisma.product.findUniqueOrThrow({ where: { id: productIds[SERIAL.fresh] } }))
        .productState;
    for (let round = 0; round < 20 && (await stateOf()) !== 'SOLD'; round += 1) {
      await worker.get(ConfirmTransactions).runOnce();
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    expect(await stateOf()).toBe('SOLD');

    const view = await verification(SERIAL.fresh);

    expect(view.status).toBe('SYNCING');
    expect(view.checks.find((check) => check.key === 'STATE')?.status).toBe('SYNCING');
    expect(view.checks.find((check) => check.key === 'ISSUER')?.status).toBe('MATCH');
    expect(await prisma.anomalyAlert.count()).toBe(0);
  });

  it('VER-01: CSDL bị sửa tay khác blockchain thì báo lệch đúng mục và tạo một cảnh báo cho Admin', async () => {
    await sync();
    await prisma.product.update({
      where: { id: productIds[SERIAL.atShop] },
      data: { productState: 'RECALLED' },
    });

    const view = await verification(SERIAL.atShop);

    expect(view.status).toBe('MISMATCH');
    expect(view.checks.filter((check) => check.status === 'MISMATCH').map((c) => c.key)).toEqual([
      'STATE',
    ]);
    expect(view.onchain?.productState).toBe('AT_RETAIL');
    const alerts = await prisma.anomalyAlert.findMany();
    expect(alerts).toEqual([
      expect.objectContaining({
        ruleCode: 'PUBLIC_VERIFICATION_MISMATCH',
        severity: 'HIGH',
        productId: productIds[SERIAL.atShop],
        alertStatus: 'OPEN',
      }),
    ]);
  });

  it('mã không tồn tại thì 404', async () => {
    await visitor.get('/api/v1/public/products/ZZZZZZZZZZZZ/verification').expect(404);
  });
});
