import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  INSPECTION_RECORD_TYPES,
  INSPECTION_REGISTRY_ABI,
  type InspectionDetail,
  type InspectionRecordAuthorization,
  type InspectionRequestView,
  inspectionDomain,
  inspectionReportHash,
  type MyInspections,
  type OrganizationApplicationAuthorization,
  PARTY_REGISTRY_ABI,
  partyIdFromUuid,
  PRODUCT_PASSPORT_ABI,
  type ProductInspection,
  type ProductRegistrationAuthorization,
  type ProductSaleAuthorization,
  type PublicPassportView,
  type PublicProductInspections,
} from '@dpp/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TestingModule } from '@nestjs/testing';
import { Contract, id, type JsonRpcSigner, sha256, Wallet } from 'ethers';
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
/** PNG 1x1 hợp lệ, làm ảnh biên bản kiểm định. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const SERIAL_SOLD = 'AC12-2611-00001';
const SERIAL_STOCK = 'AC12-2611-00002';
const SERIAL_EXTRA = 'AC12-2611-00003';

function recordArgs(auth: InspectionRecordAuthorization): unknown[] {
  return [
    auth.inspectionId,
    auth.productId,
    auth.requesterId,
    auth.resultCode,
    auth.reportHash,
    BigInt(auth.deadline),
    auth.signature,
  ];
}

async function inspectionList(agent: TestAgent, filter: string): Promise<MyInspections> {
  return (await agent.get(`/api/v1/me/inspections?filter=${filter}`).expect(200)).body;
}

async function detail(agent: TestAgent, requestId: string): Promise<InspectionDetail> {
  return (await agent.get(`/api/v1/me/inspections/${requestId}`).expect(200)).body;
}

/** INS-01 bước 1: lưu biên bản, nhận giấy phép. */
async function prepare(
  agent: TestAgent,
  requestId: string,
  fields: { result: string; summary: string },
  file: { content: Buffer; type: string } | null = null,
): Promise<InspectionRecordAuthorization> {
  let call = agent
    .post(`/api/v1/me/inspections/${requestId}/results`)
    .field('result', fields.result)
    .field('summary', fields.summary);
  if (file) {
    call = call.attach('report', file.content, { filename: 'bien-ban', contentType: file.type });
  }
  return (await call.expect(201)).body;
}

/**
 * M8 trọn luồng trên Hardhat node: nhà sản xuất hoặc chủ sở hữu (không ví) gửi yêu cầu kiểm định
 * (INS-02), huỷ khi chưa có kết quả (INS-03), đơn vị kiểm định ghi kết quả kèm biên bản bằng ví của
 * mình (INS-01) hoặc từ chối kèm lý do (INS-04); kết quả công khai trên hộ chiếu.
 */
describe('INS-01..04: yêu cầu và kết quả kiểm định (e2e, Hardhat node)', () => {
  let chain: LocalChain;
  let api: NestExpressApplication;
  let worker: TestingModule;
  let prisma: PrismaClient;
  let uploadDir: string;
  let registry: Contract;
  let passport: Contract;
  let inspections: Contract;
  let inspectionAddress: string;
  let adminWallet: JsonRpcSigner;
  let makerWallet: JsonRpcSigner;
  let shopWallet: JsonRpcSigner;
  let labWallet: JsonRpcSigner;
  let otherLabWallet: JsonRpcSigner;
  let maker: TestAgent;
  let shop: TestAgent;
  let lab: TestAgent;
  let otherLab: TestAgent;
  let buyer: TestAgent;
  let stranger: TestAgent;
  let visitor: TestAgent;
  let makerOrgId: string;
  let shopOrgId: string;
  let labOrgId: string;
  let otherLabOrgId: string;
  const productIds: Record<string, string> = {};
  const publicCodes: Record<string, string> = {};

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
      orgType: 'MANUFACTURER' | 'RETAILER' | 'INSPECTOR';
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

  /** Ví đơn vị kiểm định gửi recordInspection, web báo txHash, Worker chốt. */
  async function sendRecord(
    wallet: JsonRpcSigner,
    args: unknown[],
    reportAs: TestAgent | null = lab,
  ): Promise<string> {
    const tx = await inspections.connect(wallet).getFunction('recordInspection')(...args);
    await tx.wait();
    if (reportAs) {
      await reportAs
        .post('/api/v1/me/inspections/transactions')
        .send({ txHash: tx.hash })
        .expect(202);
    }
    await sync();
    return tx.hash;
  }

  async function manufacturerView(serial: string): Promise<ProductInspection> {
    return (await maker.get(`/api/v1/me/products/${productIds[serial]}/inspection`).expect(200))
      .body;
  }

  async function ownerView(serial: string): Promise<ProductInspection> {
    return (
      await buyer.get(`/api/v1/me/owned-products/${productIds[serial]}/inspection`).expect(200)
    ).body;
  }

  async function requestAs(
    agent: TestAgent,
    path: 'products' | 'owned-products',
    serial: string,
    inspectorOrgId: string,
    note: string,
  ): Promise<InspectionRequestView> {
    return (
      await agent
        .post(`/api/v1/me/${path}/${productIds[serial]}/inspection-requests`)
        .send({ inspectorOrgId, note })
        .expect(201)
    ).body;
  }

  /** Giấy phép registrar tự ký trong test, để thử event không khớp CSDL. */
  async function forgedPermit(overrides: {
    inspectionId: string;
    productId: string;
    requesterId: string;
    reportHash: string;
  }): Promise<unknown[]> {
    const deadline = BigInt((await chain.provider.getBlock('latest'))!.timestamp + 900);
    const record = {
      ...overrides,
      inspectorId: partyIdFromUuid(labOrgId),
      result: 1,
      deadline,
    };
    const signature = await new Wallet(TEST_REGISTRAR_KEY).signTypedData(
      inspectionDomain(31337, inspectionAddress),
      INSPECTION_RECORD_TYPES,
      record,
    );
    return [
      record.inspectionId,
      record.productId,
      record.requesterId,
      record.result,
      record.reportHash,
      deadline,
      signature,
    ];
  }

  beforeAll(async () => {
    prisma = createTestPrisma();
    await resetDatabase(prisma);
    uploadDir = await mkdtemp(join(tmpdir(), 'dpp-inspection-'));
    chain = await startHardhatNode();
    [adminWallet, makerWallet, shopWallet, labWallet, otherLabWallet] = await Promise.all([
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
    inspectionAddress = await chain.deployInspectionRegistry({
      partyRegistry: registryAddress,
      productPassport: contracts.productPassport,
    });
    registry = new Contract(registryAddress, PARTY_REGISTRY_ABI, chain.provider);
    passport = new Contract(contracts.productPassport, PRODUCT_PASSPORT_ABI, chain.provider);
    inspections = new Contract(inspectionAddress, INSPECTION_REGISTRY_ABI, chain.provider);
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
      INSPECTION_REGISTRY_ADDRESS: inspectionAddress,
      INSPECTION_REGISTRY_DEPLOY_BLOCK: deployBlock,
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
    lab = await register('kiemdinh@quatest.vn', 'Kiểm định viên Quatest');
    otherLab = await register('kiemdinh@vinacontrol.vn', 'Kiểm định viên Vinacontrol');
    buyer = await register('khach.hang@gmail.com', 'Trần Thị Khách');
    stranger = await register('nguoi.la@gmail.com', 'Người Lạ');
    for (const [agent, wallet] of [
      [maker, makerWallet],
      [shop, shopWallet],
      [lab, labWallet],
      [otherLab, otherLabWallet],
    ] as const) {
      await linkWallet(agent, wallet);
    }
    makerOrgId = await approvedOrganization(maker, makerWallet, {
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
    labOrgId = await approvedOrganization(lab, labWallet, {
      name: 'Trung tâm Kỹ thuật Tiêu chuẩn Đo lường Chất lượng 3',
      taxCode: '0301234567',
      orgType: 'INSPECTOR',
      address: '49 Pasteur, Quận 1, TP. Hồ Chí Minh',
    });
    otherLabOrgId = await approvedOrganization(otherLab, otherLabWallet, {
      name: 'Công ty Cổ phần Giám định Vinacontrol',
      taxCode: '0100107522',
      orgType: 'INSPECTOR',
      address: '54 Trần Nhân Tông, Hai Bà Trưng, Hà Nội',
    });

    // Ba máy lạnh: chiếc đầu bán cho người mua, hai chiếc còn ở kho nhà sản xuất.
    const items = [SERIAL_SOLD, SERIAL_STOCK, SERIAL_EXTRA].map((serialNumber) => ({
      serialNumber,
      warrantyMonths: 24,
      modelName: 'Máy lạnh Inverter 1.5 HP',
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
    for (const created of registration.products) {
      productIds[created.serialNumber] = created.id;
      publicCodes[created.serialNumber] = created.publicCode;
    }
    const sold = registration.productIds[0] ?? '';
    await sendPassport(makerWallet, 'dispatchCustody', [sold, partyIdFromUuid(shopOrgId)]);
    await sendPassport(shopWallet, 'confirmCustodyReceipt', [sold]);
    const sale: ProductSaleAuthorization = (
      await shop
        .post(`/api/v1/me/inventory/${productIds[SERIAL_SOLD]}/sale-authorizations`)
        .send({ buyerEmail: 'khach.hang@gmail.com' })
        .expect(201)
    ).body;
    await sendPassport(shopWallet, 'sellAndActivateWarranty', [
      sale.productId,
      sale.buyerId,
      BigInt(sale.deadline),
      sale.signature,
    ]);
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

  it('nhà sản xuất và chủ sở hữu thấy đơn vị kiểm định để chọn; người khác không xem được', async () => {
    const view = await manufacturerView(SERIAL_STOCK);
    expect(view.blockedReason).toBeNull();
    expect(view.inspectors.map((option) => option.name)).toEqual([
      'Công ty Cổ phần Giám định Vinacontrol',
      'Trung tâm Kỹ thuật Tiêu chuẩn Đo lường Chất lượng 3',
    ]);
    expect(view.requests).toEqual([]);
    expect((await ownerView(SERIAL_SOLD)).blockedReason).toBeNull();

    await stranger.get(`/api/v1/me/products/${productIds[SERIAL_STOCK]}/inspection`).expect(404);
    await shop.get(`/api/v1/me/products/${productIds[SERIAL_STOCK]}/inspection`).expect(404);
    await maker.get(`/api/v1/me/owned-products/${productIds[SERIAL_SOLD]}/inspection`).expect(404);
    await buyer.get(`/api/v1/me/owned-products/${productIds[SERIAL_STOCK]}/inspection`).expect(404);
  });

  it('INS-02, INS-03: gửi yêu cầu (không cần ví), mỗi sản phẩm một yêu cầu chờ; người gửi huỷ được', async () => {
    const wrongInspector = await maker
      .post(`/api/v1/me/products/${productIds[SERIAL_STOCK]}/inspection-requests`)
      .send({ inspectorOrgId: shopOrgId, note: 'Kiểm tra an toàn điện' })
      .expect(422);
    expect(wrongInspector.body.code).toBe('INSPECTOR_NOT_FOUND');
    await maker
      .post(`/api/v1/me/products/${productIds[SERIAL_STOCK]}/inspection-requests`)
      .send({ inspectorOrgId: labOrgId, note: '  ' })
      .expect(400);

    const first = await requestAs(maker, 'products', SERIAL_STOCK, otherLabOrgId, 'Kiểm tra lô');
    expect(first).toMatchObject({
      state: 'REQUESTED',
      requesterRole: 'MANUFACTURER',
      inspector: { name: 'Công ty Cổ phần Giám định Vinacontrol' },
      report: null,
    });
    const duplicate = await maker
      .post(`/api/v1/me/products/${productIds[SERIAL_STOCK]}/inspection-requests`)
      .send({ inspectorOrgId: labOrgId, note: 'Gửi lại' })
      .expect(409);
    expect(duplicate.body.code).toBe('INSPECTION_REQUEST_PENDING');
    expect((await manufacturerView(SERIAL_STOCK)).blockedReason).toMatch(/chờ kết quả/);

    await stranger.post(`/api/v1/me/inspection-requests/${first.id}/cancel`).expect(404);
    await buyer.post(`/api/v1/me/inspection-requests/${first.id}/cancel`).expect(404);
    await maker.post(`/api/v1/me/inspection-requests/${first.id}/cancel`).expect(204);
    await maker.post(`/api/v1/me/inspection-requests/${first.id}/cancel`).expect(409);
    const second = await requestAs(
      maker,
      'products',
      SERIAL_STOCK,
      labOrgId,
      'Kiểm tra an toàn điện và hiệu suất năng lượng',
    );
    expect((await manufacturerView(SERIAL_STOCK)).requests.map((item) => item.state)).toEqual([
      'REQUESTED',
      'CANCELLED',
    ]);
    expect(second.inspectionId).toMatch(/^0x0{32}[0-9a-f]{32}$/);
  });

  it('đơn vị được chọn thấy yêu cầu và người gửi; đơn vị khác không thấy', async () => {
    const list = await inspectionList(lab, 'REQUESTED');
    expect(list.inspector).toMatchObject({ orgType: 'INSPECTOR', authStatus: 'AUTHORIZED' });
    expect(list.counts).toEqual({ REQUESTED: 1, COMPLETED: 0, CLOSED: 0 });
    expect(list.items[0]).toMatchObject({
      note: 'Kiểm tra an toàn điện và hiệu suất năng lượng',
      requesterRole: 'MANUFACTURER',
      product: { serialNumber: SERIAL_STOCK, productState: 'CREATED' },
    });
    const requestId = list.items[0]!.id;
    expect(await detail(lab, requestId)).toMatchObject({
      requester: { kind: 'MANUFACTURER', name: 'Công ty TNHH Thiết bị Gia dụng An Phát' },
      history: [],
    });
    expect((await inspectionList(otherLab, 'CLOSED')).counts).toEqual({
      REQUESTED: 0,
      COMPLETED: 0,
      CLOSED: 1,
    });
    await otherLab.get(`/api/v1/me/inspections/${requestId}`).expect(404);
    await shop.get(`/api/v1/me/inspections/${requestId}`).expect(403);
    expect((await inspectionList(shop, 'REQUESTED')).inspector).toBeNull();
  });

  it('INS-01: biên bản kèm ảnh, giấy phép khoá kết quả và hash; ghi on-chain thì công khai, khớp hash', async () => {
    const requestId = (await inspectionList(lab, 'REQUESTED')).items[0]!.id;
    const fake = await lab
      .post(`/api/v1/me/inspections/${requestId}/results`)
      .field('result', 'PASS')
      .field('summary', 'Đạt')
      .attach('report', Buffer.from('khong phai anh'), {
        filename: 'bien-ban.png',
        contentType: 'image/png',
      })
      .expect(422);
    expect(fake.body.code).toBe('EVIDENCE_FILE');
    await lab
      .post(`/api/v1/me/inspections/${requestId}/results`)
      .field('result', 'PASS')
      .field('summary', ' ')
      .expect(400);
    await maker
      .post(`/api/v1/me/inspections/${requestId}/results`)
      .field('result', 'PASS')
      .field('summary', 'Đạt')
      .expect(403);

    const summary = 'Đạt yêu cầu an toàn điện TCVN 5699-1, hiệu suất năng lượng 5 sao';
    const auth = await prepare(
      lab,
      requestId,
      { result: 'PASS', summary },
      { content: PNG, type: 'image/png' },
    );
    expect(auth).toMatchObject({
      method: 'recordInspection',
      result: 'PASS',
      resultCode: 1,
      inspectorId: partyIdFromUuid(labOrgId),
      requesterId: partyIdFromUuid(makerOrgId),
    });
    expect(auth.reportHash).toBe(
      inspectionReportHash({
        inspectionId: auth.inspectionId,
        result: 'PASS',
        summary,
        file: { sha256: sha256(PNG), mimeType: 'image/png' },
      }),
    );
    // Biên bản chờ ghi: đơn vị kiểm định thấy, nhà sản xuất chưa thấy.
    expect((await detail(lab, requestId)).report).toMatchObject({
      syncStatus: 'PENDING',
      fileType: 'image/png',
    });
    expect((await manufacturerView(SERIAL_STOCK)).requests[0]!.report).toBeNull();
    await lab.get(`/api/v1/me/inspections/${requestId}/report`).expect(200);
    await visitor.get(`/api/v1/public/inspections/${requestId}/report`).expect(404);

    // Đơn vị khác dùng giấy phép của LAB, hoặc đổi kết quả: contract từ chối.
    await expect(
      inspections.connect(otherLabWallet).getFunction('recordInspection')(...recordArgs(auth)),
    ).rejects.toThrow();
    await expect(
      inspections.connect(labWallet).getFunction('recordInspection')(
        ...recordArgs({ ...auth, resultCode: 2 }),
      ),
    ).rejects.toThrow();

    const txHash = await sendRecord(labWallet, recordArgs(auth));
    const done = await detail(lab, requestId);
    expect(done).toMatchObject({
      state: 'COMPLETED',
      report: { syncStatus: 'CONFIRMED', txHash, matchesOnchain: true, result: 'PASS' },
    });
    expect(done.history.map((event) => event.eventName)).toEqual(['InspectionRecorded']);
    expect((await manufacturerView(SERIAL_STOCK)).requests[0]).toMatchObject({
      state: 'COMPLETED',
      report: { result: 'PASS', summary, matchesOnchain: true },
    });
    // Chỉ ghi nhận: sản phẩm vẫn ở kho nhà sản xuất.
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: productIds[SERIAL_STOCK] } }))
        .productState,
    ).toBe('CREATED');

    const publicView: PublicProductInspections = (
      await visitor
        .get(`/api/v1/public/products/${publicCodes[SERIAL_STOCK]}/inspections`)
        .expect(200)
    ).body;
    expect(publicView.items).toEqual([
      expect.objectContaining({
        id: requestId,
        result: 'PASS',
        summary,
        requesterRole: 'MANUFACTURER',
        fileType: 'image/png',
        txHash,
        matchesOnchain: true,
        inspector: expect.objectContaining({
          name: 'Trung tâm Kỹ thuật Tiêu chuẩn Đo lường Chất lượng 3',
        }),
      }),
    ]);
    const file = await visitor.get(`/api/v1/public/inspections/${requestId}/report`).expect(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(Buffer.isBuffer(file.body) && file.body.equals(PNG)).toBe(true);

    const passportView: PublicPassportView = (
      await visitor.get(`/api/v1/public/products/${publicCodes[SERIAL_STOCK]}`).expect(200)
    ).body;
    expect(passportView.journey.at(-1)).toMatchObject({
      kind: 'INSPECTED',
      txHash,
      inspectionResult: 'PASS',
      from: { kind: 'ORGANIZATION' },
    });
  });

  it('INS-04: đơn vị kiểm định từ chối kèm lý do; chủ sở hữu gửi lại, kết quả Không đạt không cần file', async () => {
    const declined = await requestAs(
      buyer,
      'owned-products',
      SERIAL_SOLD,
      otherLabOrgId,
      'Máy kêu to, nghi lỗi quạt dàn nóng',
    );
    expect(declined.requesterRole).toBe('OWNER');
    await otherLab
      .post(`/api/v1/me/inspections/${declined.id}/decline`)
      .send({ reason: '' })
      .expect(400);
    await otherLab
      .post(`/api/v1/me/inspections/${declined.id}/decline`)
      .send({ reason: 'Đơn vị chưa có phòng thử nghiệm máy lạnh' })
      .expect(204);
    expect((await ownerView(SERIAL_SOLD)).requests[0]).toMatchObject({
      state: 'DECLINED',
      declineReason: 'Đơn vị chưa có phòng thử nghiệm máy lạnh',
    });

    const owned = await requestAs(
      buyer,
      'owned-products',
      SERIAL_SOLD,
      labOrgId,
      'Máy kêu to, nghi lỗi quạt dàn nóng',
    );
    expect(await detail(lab, owned.id)).toMatchObject({
      requester: { kind: 'OWNER', fullName: 'Trần Thị Khách', maskedEmail: 'k***@gmail.com' },
      product: { productState: 'SOLD' },
    });
    const auth = await prepare(lab, owned.id, {
      result: 'FAIL',
      summary: 'Độ ồn dàn nóng 68 dB, vượt mức cho phép',
    });
    expect(auth.requesterId).not.toBe(partyIdFromUuid(makerOrgId));
    await sendRecord(labWallet, recordArgs(auth));

    expect((await ownerView(SERIAL_SOLD)).requests.map((item) => item.state)).toEqual([
      'COMPLETED',
      'DECLINED',
    ]);
    expect((await ownerView(SERIAL_SOLD)).requests[0]!.report).toMatchObject({
      result: 'FAIL',
      fileType: null,
      matchesOnchain: true,
    });
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productIds[SERIAL_SOLD] },
    });
    expect(product.productState).toBe('SOLD');
    await visitor.get(`/api/v1/public/inspections/${owned.id}/report`).expect(404);
  });

  it('sửa biên bản trong CSDL thì không còn khớp hash; hash lạ, mã lạ và yêu cầu đã huỷ đều tạo cảnh báo', async () => {
    const stock = (await inspectionList(lab, 'COMPLETED')).items.find(
      (item) => item.product.serialNumber === SERIAL_STOCK,
    )!;
    const row = await prisma.inspection.findFirstOrThrow({
      where: { requestId: stock.id, syncStatus: 'CONFIRMED' },
    });
    await prisma.inspection.update({ where: { id: row.id }, data: { summary: 'Đạt' } });
    const tampered: PublicProductInspections = (
      await visitor
        .get(`/api/v1/public/products/${publicCodes[SERIAL_STOCK]}/inspections`)
        .expect(200)
    ).body;
    expect(tampered.items[0]!.matchesOnchain).toBe(false);
    expect((await detail(lab, stock.id)).report!.matchesOnchain).toBe(false);
    await prisma.inspection.update({ where: { id: row.id }, data: { summary: row.summary } });
    expect((await detail(lab, stock.id)).report!.matchesOnchain).toBe(true);

    // Yêu cầu bị huỷ đúng lúc giao dịch đang chờ: chain thắng, yêu cầu thành COMPLETED.
    const late = await requestAs(maker, 'products', SERIAL_EXTRA, labOrgId, 'Kiểm định lô hàng');
    const lateAuth = await prepare(lab, late.id, {
      result: 'CONDITIONAL',
      summary: 'Đạt có điều kiện',
    });
    await maker.post(`/api/v1/me/inspection-requests/${late.id}/cancel`).expect(204);
    await sendRecord(labWallet, recordArgs(lateAuth));
    expect((await detail(lab, late.id)).state).toBe('COMPLETED');

    // Hash biên bản không có trong CSDL, và mã kiểm định do hệ thống khác sinh ra.
    const mismatch = await requestAs(maker, 'products', SERIAL_EXTRA, labOrgId, 'Kiểm định lại');
    await sendRecord(
      labWallet,
      await forgedPermit({
        inspectionId: mismatch.inspectionId,
        productId: lateAuth.productId,
        requesterId: partyIdFromUuid(makerOrgId),
        reportHash: id('bien ban khong co trong CSDL'),
      }),
      null,
    );
    expect((await detail(lab, mismatch.id)).state).toBe('COMPLETED');
    await sendRecord(
      labWallet,
      await forgedPermit({
        inspectionId: id('ma kiem dinh la'),
        productId: lateAuth.productId,
        requesterId: partyIdFromUuid(makerOrgId),
        reportHash: id('bien ban la'),
      }),
      null,
    );

    const alerts = await prisma.anomalyAlert.findMany({ orderBy: { createdAt: 'asc' } });
    expect(alerts.map((alert) => alert.ruleCode)).toEqual([
      'INSPECTION_CONFLICT',
      'INSPECTION_REPORT_MISMATCH',
      'INSPECTION_UNKNOWN',
    ]);
  });

  it('CSDL: mỗi sản phẩm một yêu cầu chờ, chỉ DECLINED có lý do, mỗi yêu cầu một biên bản đã ghi', async () => {
    const base = {
      productId: productIds[SERIAL_EXTRA]!,
      requestedByPartyId: makerOrgId,
      inspectorOrgId: labOrgId,
      note: 'Kiểm định',
    };
    const pending = await prisma.inspectionRequest.create({ data: base });
    await expect(prisma.inspectionRequest.create({ data: base })).rejects.toThrow();
    await expect(
      prisma.inspectionRequest.update({
        where: { id: pending.id },
        data: { requestState: 'DECLINED', closedAt: new Date() },
      }),
    ).rejects.toThrow(/ck_inspection_requests_state_consistency/);
    await expect(
      prisma.inspectionRequest.update({
        where: { id: pending.id },
        data: { requestState: 'CANCELLED' },
      }),
    ).rejects.toThrow(/ck_inspection_requests_state_consistency/);

    const confirmed = await prisma.inspection.findFirstOrThrow({
      where: { syncStatus: 'CONFIRMED' },
    });
    await expect(
      prisma.inspection.create({
        data: {
          requestId: confirmed.requestId,
          productId: confirmed.productId,
          inspectorOrgId: confirmed.inspectorOrgId,
          result: 'PASS',
          summary: 'Bản thứ hai',
          reportHash: id('ban thu hai'),
          chainInspectionId: id('ma khac'),
          txHash: id('giao dich khac'),
          inspectedAt: new Date(),
          syncStatus: 'CONFIRMED',
        },
      }),
    ).rejects.toThrow();
    await prisma.inspectionRequest.delete({ where: { id: pending.id } });
  });
});
