import {
  MANUFACTURER_ROLE,
  type MyProductList,
  type OrganizationApplicationAuthorization,
  PARTY_REGISTRY_ABI,
  PRODUCT_PASSPORT_ABI,
  type ProductDetail,
  type ProductRegistrationAuthorization,
  type PublicPassportView,
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
const LAPTOP = {
  serialNumber: 'abc-2026-000128',
  modelName: 'Laptop ABC Pro 14',
  description: 'Màu bạc, RAM 16 GB',
  manufacturedOn: '2026-10-01',
  warrantyMonths: 24,
};

/**
 * M5 trọn luồng trên Hardhat node: nhà sản xuất đã duyệt đăng ký từng sản phẩm và lô CSV bằng ví
 * cá nhân, Indexer chiếu ProductRegistered, ai cũng tra cứu được hộ chiếu bằng mã QR.
 */
describe('PRD-01, PRD-02: đăng ký sản phẩm và tra cứu bằng mã QR (e2e, Hardhat node)', () => {
  let chain: LocalChain;
  let api: NestExpressApplication;
  let worker: TestingModule;
  let prisma: PrismaClient;
  let registry: Contract;
  let passport: Contract;
  let adminWallet: JsonRpcSigner;
  let makerWallet: JsonRpcSigner;
  let maker: TestAgent;
  let visitor: TestAgent;

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
    // Gọi thẳng eth_blockNumber: getBlockNumber() của ethers giữ kết quả cũ trong 250 ms.
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

  /** Ví cá nhân gửi registerProducts theo giấy phép; `report` = web có báo txHash cho API. */
  async function sendRegistration(
    authorization: ProductRegistrationAuthorization,
    report = true,
  ): Promise<string> {
    const tx = await passport.connect(makerWallet).getFunction('registerProducts')(
      authorization.issuerId,
      authorization.productIds,
      authorization.metadataHashes,
      authorization.warrantyMonths,
      BigInt(authorization.deadline),
      authorization.signature,
    );
    await tx.wait();
    if (report) {
      await maker.post('/api/v1/me/products/transactions').send({ txHash: tx.hash }).expect(202);
    }
    await sync();
    return tx.hash;
  }

  async function myProducts(query = ''): Promise<MyProductList> {
    return (await maker.get(`/api/v1/me/products${query}`).expect(200)).body;
  }

  beforeAll(async () => {
    prisma = createTestPrisma();
    await resetDatabase(prisma);
    chain = await startHardhatNode();
    [adminWallet, makerWallet] = await Promise.all([chain.signer(0), chain.signer(2)]);
    const registryAddress = await chain.deployPartyRegistry(
      new Wallet(TEST_REGISTRAR_KEY).address,
      {
        registrationFee: 0n,
      },
    );
    const { productPassport: passportAddress, warrantyManager } =
      await chain.deployProductContracts(registryAddress);
    registry = new Contract(registryAddress, PARTY_REGISTRY_ABI, chain.provider);
    passport = new Contract(passportAddress, PRODUCT_PASSPORT_ABI, chain.provider);
    const deployBlock = String(await chain.provider.getBlockNumber());
    const config = createTestConfig({
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      JWT_SECRET: process.env.JWT_SECRET ?? '',
      AUTH_RATE_LIMIT_PER_MINUTE: '10000',
      RPC_URL: chain.url,
      CHAIN_ID: '31337',
      PARTY_REGISTRY_ADDRESS: registryAddress,
      PARTY_REGISTRY_DEPLOY_BLOCK: deployBlock,
      PRODUCT_PASSPORT_ADDRESS: passportAddress,
      PRODUCT_PASSPORT_DEPLOY_BLOCK: deployBlock,
      WARRANTY_MANAGER_ADDRESS: warrantyManager,
    });
    api = await createApiApp({ config });
    worker = await createWorkerContext(config);
    visitor = request.agent(api.getHttpServer());

    const admin = await register('admin@dpp.vn', 'Quản trị viên');
    await prisma.user.update({ where: { email: 'admin@dpp.vn' }, data: { systemRole: 'ADMIN' } });
    await linkWallet(admin, adminWallet);
    maker = await register('dai.dien@lamsonviet.vn', 'Người Đại Diện');
    await linkWallet(maker, makerWallet);
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await worker?.close();
    await chain?.stop();
    await prisma?.$disconnect();
  });

  it('chưa là nhà sản xuất được duyệt thì không đăng ký được sản phẩm', async () => {
    const response = await maker
      .post('/api/v1/me/products/registrations')
      .send({ items: [LAPTOP] })
      .expect(403);
    expect(response.body.code).toBe('MANUFACTURER_REQUIRED');
    expect((await myProducts()).manufacturer).toBeNull();
  });

  it('nhà sản xuất được Admin duyệt (M4) thì danh sách sản phẩm sẵn sàng', async () => {
    const application = await maker
      .post('/api/v1/me/organization/application')
      .send({
        name: 'Công ty Cổ phần Thiết bị Thông minh Lam Sơn Việt',
        taxCode: '0317584261',
        orgType: 'MANUFACTURER',
        contactEmail: 'lienhe@lamsonviet-tech.vn',
        address: 'Lô 18, Đường số 7, KCN Tân Tạo, TP. Hồ Chí Minh',
      })
      .expect(201);
    const auth: OrganizationApplicationAuthorization = application.body;
    await (
      await registry.connect(makerWallet).getFunction('applyOrganization')(
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

    const list = await myProducts();
    expect(list.manufacturer).toMatchObject({ authStatus: 'AUTHORIZED', partyId: auth.partyId });
    expect(
      await registry.getFunction('authorizedOrganizationOf')(
        makerWallet.address,
        MANUFACTURER_ROLE,
      ),
    ).toBe(auth.partyId);
  });

  it('PRD-01: đăng ký một sản phẩm; Indexer chốt thành CREATED, nhà sản xuất giữ hàng', async () => {
    const response = await maker
      .post('/api/v1/me/products/registrations')
      .send({ items: [LAPTOP] })
      .expect(201);
    const authorization: ProductRegistrationAuthorization = response.body;
    expect(authorization.products[0]?.serialNumber).toBe('ABC-2026-000128');

    const txHash = await sendRegistration(authorization);

    const { items, counts } = await myProducts();
    expect(counts).toEqual({ ALL: 1, REGISTERED: 1, DRAFT: 0 });
    expect(items[0]).toMatchObject({
      serialNumber: 'ABC-2026-000128',
      productState: 'CREATED',
      syncStatus: 'CONFIRMED',
      createdTxHash: txHash,
    });
    const product = await prisma.product.findFirstOrThrow({ include: { custodyRecords: true } });
    expect(product.currentCustodianPartyId).toBe(product.issuerOrgId);
    expect(product.custodyRecords).toEqual([
      expect.objectContaining({ fromPartyId: null, toPartyId: product.issuerOrgId }),
    ]);
    const event = await prisma.blockchainEvent.findFirstOrThrow({
      where: { eventName: 'ProductRegistered' },
    });
    expect(event.chainProductId).toBe(product.chainProductId);
  });

  it('PRD-02: lô CSV 3 sản phẩm chỉ một giao dịch; web không kịp báo txHash thì Indexer vẫn chốt', async () => {
    const items = ['LOT-01', 'LOT-02', 'LOT-03'].map((serialNumber) => ({
      ...LAPTOP,
      serialNumber,
    }));
    const response = await maker
      .post('/api/v1/me/products/registrations')
      .send({ items })
      .expect(201);

    const txHash = await sendRegistration(response.body, false);

    const lot = await prisma.product.findMany({ where: { serialNumber: { startsWith: 'LOT-' } } });
    expect(lot).toHaveLength(3);
    expect(lot.every((row) => row.createdTxHash === txHash && row.syncStatus === 'CONFIRMED')).toBe(
      true,
    );
  });

  it('ai cũng tra cứu được bằng mã QR: hồ sơ khớp hash và khớp dữ liệu đọc trực tiếp trên chain', async () => {
    const product = await prisma.product.findFirstOrThrow({
      where: { serialNumber: 'ABC-2026-000128' },
    });

    const response = await visitor.get(`/api/v1/public/products/${product.publicCode}`).expect(200);
    const view: PublicPassportView = response.body;

    expect(view).toMatchObject({
      serialNumber: 'ABC-2026-000128',
      modelName: 'Laptop ABC Pro 14',
      manufacturedOn: '2026-10-01',
      warrantyMonths: 24,
      productState: 'CREATED',
      issuer: {
        name: 'Công ty Cổ phần Thiết bị Thông minh Lam Sơn Việt',
        authStatus: 'AUTHORIZED',
      },
      holder: {
        kind: 'ORGANIZATION',
        organization: { name: 'Công ty Cổ phần Thiết bị Thông minh Lam Sơn Việt' },
      },
      hasOwner: false,
      warranty: null,
      proof: { metadataMatchesHash: true, onchainMatches: true, productId: product.chainProductId },
    });
    expect(view.history.map((event) => event.eventName)).toEqual(['ProductRegistered']);
    expect(view.journey).toMatchObject([{ kind: 'REGISTERED', from: null }]);

    // Mã gõ tay có gạch nối, chữ thường, hoặc cả đường dẫn quét được đều nhận.
    const grouped = product.publicCode.match(/.{4}/g)?.join('-').toLowerCase() ?? '';
    await visitor.get(`/api/v1/public/products/${grouped}`).expect(200);
    await visitor.get('/api/v1/public/products/KMNPKMNPKMNP').expect(404);
    await visitor.get('/api/v1/public/products/khong-hop-le').expect(400);
  });

  it('bản nháp chưa gửi: không có hộ chiếu công khai, gửi lại được, xoá được', async () => {
    const response = await maker
      .post('/api/v1/me/products/registrations')
      .send({ items: [{ ...LAPTOP, serialNumber: 'DRAFT-1' }] })
      .expect(201);
    const draft = response.body.products[0];
    await visitor.get(`/api/v1/public/products/${draft.publicCode}`).expect(404);
    expect((await myProducts('?filter=DRAFT')).items.map((item) => item.serialNumber)).toEqual([
      'DRAFT-1',
    ]);

    const retry = await maker
      .post('/api/v1/me/products/registrations/retry')
      .send({ productIds: [draft.id] })
      .expect(201);
    expect(retry.body.productIds).toEqual(response.body.productIds);

    await maker.delete(`/api/v1/me/products/${draft.id}`).expect(204);
    expect((await myProducts('?filter=DRAFT')).items).toHaveLength(0);
  });

  it('serial đã dùng thì 409; dữ liệu sai (ngày tương lai, serial có khoảng trắng) thì 400', async () => {
    const taken = await maker
      .post('/api/v1/me/products/registrations')
      .send({ items: [{ ...LAPTOP, serialNumber: 'ABC-2026-000128' }] })
      .expect(409);
    expect(taken.body).toMatchObject({
      code: 'SERIAL_TAKEN',
      details: { serials: ['ABC-2026-000128'] },
    });

    await maker
      .post('/api/v1/me/products/registrations')
      .send({ items: [{ ...LAPTOP, serialNumber: 'X 1', manufacturedOn: '2999-01-01' }] })
      .expect(400);
  });

  it('sản phẩm đã ghi lên blockchain thì không xoá được; chi tiết có bằng chứng và lịch sử', async () => {
    const product = await prisma.product.findFirstOrThrow({
      where: { serialNumber: 'ABC-2026-000128' },
    });

    const remove = await maker.delete(`/api/v1/me/products/${product.id}`).expect(409);
    expect(remove.body.code).toBe('PRODUCT_ALREADY_ON_CHAIN');

    const detail: ProductDetail = (await maker.get(`/api/v1/me/products/${product.id}`).expect(200))
      .body;
    expect(detail).toMatchObject({
      description: 'Màu bạc, RAM 16 GB',
      proof: { onchainMatches: true, registrationTxHash: product.createdTxHash },
    });
    expect(detail.history).toHaveLength(1);
    const actions = (await prisma.auditLog.findMany()).map((log) => log.action);
    expect(actions.filter((action) => action === 'PRODUCT_REGISTERED')).toHaveLength(4);
  });
});
