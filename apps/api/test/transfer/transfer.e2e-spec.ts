import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type MyTransfers,
  type OrganizationApplicationAuthorization,
  type OwnedProductDetail,
  type OwnedProductTransfer,
  OWNERSHIP_TRANSFER_ABI,
  PARTY_REGISTRY_ABI,
  partyIdFromUuid,
  PRODUCT_PASSPORT_ABI,
  type ProductRegistrationAuthorization,
  type ProductSaleAuthorization,
  type PublicPassportView,
  SERVICE_TICKET_MANAGER_ABI,
  type ServiceTicketOpeningAuthorization,
  type TransferRecipientPreview,
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
const SERIAL_PERSON = 'TV55-2611-00001';
const SERIAL_SHOP = 'TV55-2611-00002';
const SHOP_TAX = '0312345678';
const BUYBACK_TAX = '0319998887';

function createArgs(auth: TransferRequestAuthorization): unknown[] {
  return [
    auth.productId,
    auth.toPartyId,
    BigInt(auth.expiresAt),
    BigInt(auth.deadline),
    auth.signature,
  ];
}

async function transfersOf(agent: TestAgent, filter: string): Promise<MyTransfers> {
  return (await agent.get(`/api/v1/me/transfers?filter=${filter}`).expect(200)).body;
}

/**
 * M9 trọn luồng trên Hardhat node: chủ sở hữu tạo yêu cầu bằng ví của mình (TRF-01), bên nhận là cá
 * nhân hoặc tổ chức chấp nhận, từ chối (TRF-03, TRF-04), chủ huỷ (TRF-02), quá hạn thì ai cũng đóng
 * (TRF-05); danh sách (TRF-06); bảo hành đi theo, đang sửa thì không chuyển.
 */
describe('TRF-01..06: chuyển nhượng quyền sở hữu (e2e, Hardhat node)', () => {
  let chain: LocalChain;
  let api: NestExpressApplication;
  let worker: TestingModule;
  let prisma: PrismaClient;
  let uploadDir: string;
  let registry: Contract;
  let passport: Contract;
  let tickets: Contract;
  let transfers: Contract;
  let adminWallet: JsonRpcSigner;
  let makerWallet: JsonRpcSigner;
  let shopWallet: JsonRpcSigner;
  let centerWallet: JsonRpcSigner;
  let ownerWallet: JsonRpcSigner;
  let receiverWallet: JsonRpcSigner;
  let buybackWallet: JsonRpcSigner;
  let maker: TestAgent;
  let shop: TestAgent;
  let center: TestAgent;
  let owner: TestAgent;
  let receiver: TestAgent;
  let buyback: TestAgent;
  let stranger: TestAgent;
  let visitor: TestAgent;
  let shopOrgId: string;
  let centerOrgId: string;
  let buybackOrgId: string;
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

  /** Worker chốt giao dịch đã báo và quét log của cả 5 contract tới block hiện tại. */
  async function sync(): Promise<void> {
    await worker.get(ConfirmTransactions).runOnce();
    const indexer = worker.get(IndexChainEvents);
    const head = BigInt(await chain.provider.send('eth_blockNumber', []));
    for (let round = 0; round < 20; round += 1) {
      await indexer.runOnce();
      const checkpoints = await prisma.indexerCheckpoint.findMany();
      if (
        checkpoints.length === 5 &&
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

  async function send(
    contract: Contract,
    wallet: JsonRpcSigner,
    method: string,
    args: unknown[],
    reportAs: TestAgent | null = null,
  ): Promise<string> {
    const tx = await contract.connect(wallet).getFunction(method)(...args);
    await tx.wait();
    if (reportAs) {
      await reportAs
        .post('/api/v1/me/transfers/transactions')
        .send({ txHash: tx.hash })
        .expect(202);
    }
    await sync();
    return tx.hash;
  }

  async function transferView(agent: TestAgent, serial: string): Promise<OwnedProductTransfer> {
    return (await agent.get(`/api/v1/me/owned-products/${productIds[serial]}/transfer`).expect(200))
      .body;
  }

  async function permitFor(
    agent: TestAgent,
    serial: string,
    recipient: string,
    days = 7,
  ): Promise<TransferRequestAuthorization> {
    return (
      await agent
        .post(`/api/v1/me/owned-products/${productIds[serial]}/transfer-authorizations`)
        .send({ recipient, days })
        .expect(201)
    ).body;
  }

  /** TRF-01: lấy giấy phép rồi ví của `wallet` gửi createTransferRequest. */
  async function requestTransfer(
    agent: TestAgent,
    wallet: JsonRpcSigner,
    serial: string,
    recipient: string,
    days = 7,
  ): Promise<string> {
    const auth = await permitFor(agent, serial, recipient, days);
    await send(transfers, wallet, 'createTransferRequest', createArgs(auth), agent);
    const view = await transferView(agent, serial);
    return view.active?.requestId ?? '';
  }

  beforeAll(async () => {
    prisma = createTestPrisma();
    await resetDatabase(prisma);
    uploadDir = await mkdtemp(join(tmpdir(), 'dpp-transfer-'));
    chain = await startHardhatNode();
    [
      adminWallet,
      makerWallet,
      shopWallet,
      centerWallet,
      ownerWallet,
      receiverWallet,
      buybackWallet,
    ] = await Promise.all([
      chain.signer(0),
      chain.signer(2),
      chain.signer(3),
      chain.signer(4),
      chain.signer(5),
      chain.signer(6),
      chain.signer(7),
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
    registry = new Contract(registryAddress, PARTY_REGISTRY_ABI, chain.provider);
    passport = new Contract(contracts.productPassport, PRODUCT_PASSPORT_ABI, chain.provider);
    tickets = new Contract(ticketAddress, SERVICE_TICKET_MANAGER_ABI, chain.provider);
    transfers = new Contract(transferAddress, OWNERSHIP_TRANSFER_ABI, chain.provider);
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
      SERVICE_TICKET_MANAGER_ADDRESS: ticketAddress,
      SERVICE_TICKET_MANAGER_DEPLOY_BLOCK: deployBlock,
      OWNERSHIP_TRANSFER_ADDRESS: transferAddress,
      OWNERSHIP_TRANSFER_DEPLOY_BLOCK: deployBlock,
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
    buyback = await register('thumua@cuchoi.vn', 'Đại diện Thu Mua');
    stranger = await register('nguoi.la@gmail.com', 'Người Lạ');
    for (const [agent, wallet] of [
      [maker, makerWallet],
      [shop, shopWallet],
      [center, centerWallet],
      [owner, ownerWallet],
      [receiver, receiverWallet],
      [buyback, buybackWallet],
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
      taxCode: SHOP_TAX,
      orgType: 'RETAILER',
      address: '120 Nguyễn Trãi, Quận 1, TP. Hồ Chí Minh',
    });
    centerOrgId = await approvedOrganization(center, centerWallet, {
      name: 'Trung tâm Bảo hành An Phát',
      taxCode: '0315556667',
      orgType: 'SERVICE_CENTER',
      address: '45 Lý Thường Kiệt, Quận 10, TP. Hồ Chí Minh',
    });
    buybackOrgId = await approvedOrganization(buyback, buybackWallet, {
      name: 'Cửa hàng Thu cũ Đổi mới Cù Chói',
      taxCode: BUYBACK_TAX,
      orgType: 'RETAILER',
      address: '9 Hai Bà Trưng, Quận 3, TP. Hồ Chí Minh',
    });

    // Hai tivi, cả hai bán cho Nguyễn Văn An (đã liên kết ví).
    const items = [SERIAL_PERSON, SERIAL_SHOP].map((serialNumber) => ({
      serialNumber,
      warrantyMonths: 24,
      modelName: 'Smart TV 55 inch',
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
      const chainProductId = registration.productIds[index] ?? '';
      await send(passport, makerWallet, 'dispatchCustody', [
        chainProductId,
        partyIdFromUuid(shopOrgId),
      ]);
      await send(passport, shopWallet, 'confirmCustodyReceipt', [chainProductId]);
      const sale: ProductSaleAuthorization = (
        await shop
          .post(`/api/v1/me/inventory/${created.id}/sale-authorizations`)
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

  it('chủ sở hữu thấy phần chuyển nhượng; người khác không xem được; tra bên nhận theo email hoặc mã số thuế', async () => {
    const view = await transferView(owner, SERIAL_PERSON);
    expect(view).toMatchObject({ blockedReason: null, active: null, history: [] });
    expect(view.wallet).toBe((await ownerWallet.getAddress()).toLowerCase());
    await receiver
      .get(`/api/v1/me/owned-products/${productIds[SERIAL_PERSON]}/transfer`)
      .expect(404);
    await shop.get(`/api/v1/me/owned-products/${productIds[SERIAL_PERSON]}/transfer`).expect(404);

    const path = `/api/v1/me/owned-products/${productIds[SERIAL_PERSON]}/transfer-recipients`;
    const person: TransferRecipientPreview = (
      await owner.post(path).send({ recipient: 'LE.BINH@gmail.com' }).expect(200)
    ).body;
    expect(person).toMatchObject({
      party: { kind: 'PERSON', fullName: 'Lê Thị Bình', maskedEmail: 'l***@gmail.com' },
      needsWallet: false,
    });
    const organization: TransferRecipientPreview = (
      await owner.post(path).send({ recipient: BUYBACK_TAX }).expect(200)
    ).body;
    expect(organization).toMatchObject({
      partyId: partyIdFromUuid(buybackOrgId),
      party: { kind: 'ORGANIZATION', name: 'Cửa hàng Thu cũ Đổi mới Cù Chói' },
    });
    expect(
      (await owner.post(path).send({ recipient: 'khong.co@gmail.com' }).expect(422)).body.code,
    ).toBe('TRANSFER_RECIPIENT_NOT_FOUND');
    expect((await owner.post(path).send({ recipient: '0100000000' }).expect(422)).body.code).toBe(
      'TRANSFER_RECIPIENT_NOT_FOUND',
    );
    expect(
      (await owner.post(path).send({ recipient: 'nguyen.an@gmail.com' }).expect(422)).body.code,
    ).toBe('TRANSFER_RECIPIENT_INVALID');
    await owner
      .post(`/api/v1/me/owned-products/${productIds[SERIAL_PERSON]}/transfer-authorizations`)
      .send({ recipient: 'le.binh@gmail.com', days: 31 })
      .expect(400);
  });

  it('TRF-01, TRF-03: chủ tạo yêu cầu, bên nhận chấp nhận; đổi chủ, bảo hành đi theo, yêu cầu cũ của chủ trước bị huỷ', async () => {
    // Chủ cũ đang có một yêu cầu bảo hành chưa tiếp nhận.
    await owner
      .post(`/api/v1/me/owned-products/${productIds[SERIAL_PERSON]}/service-requests`)
      .send({ serviceCenterOrgId: centerOrgId, issueDesc: 'Màn hình chập chờn' })
      .expect(201);

    const auth = await permitFor(owner, SERIAL_PERSON, 'le.binh@gmail.com');
    expect(auth).toMatchObject({
      method: 'createTransferRequest',
      recipient: { kind: 'PERSON', fullName: 'Lê Thị Bình' },
    });
    const days = (Number(auth.expiresAt) * 1000 - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
    await send(transfers, ownerWallet, 'createTransferRequest', createArgs(auth), owner);

    const pending = await transferView(owner, SERIAL_PERSON);
    expect(pending.active).toMatchObject({
      state: 'REQUESTED',
      expired: false,
      direction: 'OUTGOING',
      to: { kind: 'PERSON', fullName: 'Lê Thị Bình' },
    });
    expect(pending.blockedReason).toMatch(/chờ bên nhận/);
    expect(
      (
        await owner
          .post(`/api/v1/me/owned-products/${productIds[SERIAL_PERSON]}/transfer-authorizations`)
          .send({ recipient: BUYBACK_TAX, days: 7 })
          .expect(409)
      ).body.code,
    ).toBe('TRANSFER_NOT_ALLOWED');
    const incoming = await transfersOf(receiver, 'INCOMING');
    expect(incoming.counts).toEqual({ INCOMING: 1, OUTGOING: 0, CLOSED: 0 });
    expect(incoming.items[0]).toMatchObject({
      direction: 'INCOMING',
      from: { kind: 'PERSON', fullName: 'Nguyễn Văn An', maskedEmail: 'n***@gmail.com' },
      to: { isYou: true },
      product: { serialNumber: SERIAL_PERSON },
    });
    expect((await transfersOf(owner, 'OUTGOING')).counts.OUTGOING).toBe(1);

    // Người khác không chấp nhận được thay bên nhận.
    await expect(
      transfers.connect(buybackWallet).getFunction('acceptTransfer')(
        BigInt(incoming.items[0]!.requestId),
      ),
    ).rejects.toThrow();
    await send(
      transfers,
      receiverWallet,
      'acceptTransfer',
      [BigInt(incoming.items[0]!.requestId)],
      receiver,
    );

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productIds[SERIAL_PERSON] },
    });
    const receiverParty = await prisma.party.findFirstOrThrow({
      where: { user: { email: 'le.binh@gmail.com' } },
    });
    expect(product.currentOwnerPartyId).toBe(receiverParty.id);
    const closed = await transfersOf(receiver, 'CLOSED');
    expect(closed.items[0]).toMatchObject({ state: 'COMPLETED' });
    const record = await prisma.ownershipRecord.findFirstOrThrow({
      where: { productId: product.id, toPartyId: receiverParty.id },
    });
    expect(record.transferRequestId).toBe(closed.items[0]!.id);

    await owner.get(`/api/v1/me/owned-products/${product.id}`).expect(404);
    const detail: OwnedProductDetail = (
      await receiver.get(`/api/v1/me/owned-products/${product.id}`).expect(200)
    ).body;
    expect(detail.warranty).toMatchObject({ state: 'ACTIVE' });
    const service = await prisma.serviceRequest.findFirstOrThrow({
      where: { productId: product.id },
    });
    expect(service.serviceState).toBe('CANCELLED');

    const passportView: PublicPassportView = (
      await visitor.get(`/api/v1/public/products/${publicCodes[SERIAL_PERSON]}`).expect(200)
    ).body;
    expect(passportView.journey.at(-1)).toMatchObject({
      kind: 'OWNERSHIP_TRANSFERRED',
      from: { kind: 'PERSON' },
      to: { kind: 'PERSON' },
    });
    expect(JSON.stringify(passportView)).not.toMatch(/Bình|Nguyễn Văn An|gmail/);
  });

  it('đang có phiếu sửa mở thì không chuyển nhượng được', async () => {
    const serviceRequest: { id: string } = (
      await receiver
        .post(`/api/v1/me/owned-products/${productIds[SERIAL_PERSON]}/service-requests`)
        .send({ serviceCenterOrgId: centerOrgId, issueDesc: 'Mất tiếng' })
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
    expect((await transferView(receiver, SERIAL_PERSON)).blockedReason).toMatch(/phiếu sửa/);
    expect(
      (
        await receiver
          .post(`/api/v1/me/owned-products/${productIds[SERIAL_PERSON]}/transfer-authorizations`)
          .send({ recipient: 'nguyen.an@gmail.com', days: 7 })
          .expect(409)
      ).body.code,
    ).toBe('TRANSFER_NOT_ALLOWED');
  });

  it('TRF-04, TRF-02: tổ chức từ chối, chủ tự huỷ; rồi tổ chức chấp nhận và người đại diện thao tác thay tổ chức', async () => {
    const rejected = await requestTransfer(owner, ownerWallet, SERIAL_SHOP, BUYBACK_TAX);
    const incoming = await transfersOf(buyback, 'INCOMING');
    expect(incoming.items[0]).toMatchObject({
      requestId: rejected,
      to: { kind: 'ORGANIZATION', isYou: true, taxCode: BUYBACK_TAX },
    });
    await send(transfers, buybackWallet, 'rejectTransfer', [BigInt(rejected)], buyback);

    const cancelled = await requestTransfer(owner, ownerWallet, SERIAL_SHOP, 'le.binh@gmail.com');
    await expect(
      transfers.connect(receiverWallet).getFunction('cancelTransfer')(BigInt(cancelled)),
    ).rejects.toThrow();
    await send(transfers, ownerWallet, 'cancelTransfer', [BigInt(cancelled)], owner);
    expect((await transferView(owner, SERIAL_SHOP)).history.map((item) => item.state)).toEqual([
      'CANCELLED',
      'REJECTED',
    ]);

    const accepted = await requestTransfer(owner, ownerWallet, SERIAL_SHOP, BUYBACK_TAX);
    await send(transfers, buybackWallet, 'acceptTransfer', [BigInt(accepted)], buyback);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: productIds[SERIAL_SHOP] } }))
        .currentOwnerPartyId,
    ).toBe(buybackOrgId);
    // Người đại diện thấy sản phẩm của tổ chức trong "Đã mua" và chuyển tiếp được.
    const owned: { serialNumber: string }[] = (
      await buyback.get('/api/v1/me/owned-products').expect(200)
    ).body;
    expect(owned.map((item) => item.serialNumber)).toEqual([SERIAL_SHOP]);
    expect((await transferView(buyback, SERIAL_SHOP)).blockedReason).toBeNull();
    expect((await transfersOf(owner, 'CLOSED')).counts.CLOSED).toBe(4);
  });

  it('TRF-05: quá hạn thì bên nhận không chấp nhận được, ai cũng đóng được', async () => {
    const requestId = await requestTransfer(
      buyback,
      buybackWallet,
      SERIAL_SHOP,
      'nguyen.an@gmail.com',
      1,
    );
    expect((await transfersOf(owner, 'INCOMING')).items[0]).toMatchObject({
      requestId,
      from: { kind: 'ORGANIZATION', name: 'Cửa hàng Thu cũ Đổi mới Cù Chói' },
    });
    await expect(
      transfers.connect(adminWallet).getFunction('expireTransfer')(BigInt(requestId)),
    ).rejects.toThrow();

    // Chuyển thời gian của chain qua hạn của yêu cầu (hạn tính theo giờ thật của API).
    const expiresAt = Date.parse((await transfersOf(owner, 'INCOMING')).items[0]!.expiresAt);
    await chain.provider.send('evm_setNextBlockTimestamp', [Math.floor(expiresAt / 1000) + 60]);
    await chain.mine();
    await expect(
      transfers.connect(ownerWallet).getFunction('acceptTransfer')(BigInt(requestId), {
        gasLimit: 400_000n,
      }),
    ).rejects.toThrow(/RequestExpired/);
    // Đặt gas limit để giao dịch chạy trong block mới (ước lượng gas của node dùng giờ thật).
    await send(transfers, adminWallet, 'expireTransfer', [
      BigInt(requestId),
      { gasLimit: 200_000n },
    ]);
    expect((await transferView(buyback, SERIAL_SHOP)).history[0]).toMatchObject({
      requestId,
      state: 'EXPIRED',
    });
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: productIds[SERIAL_SHOP] } }))
        .currentOwnerPartyId,
    ).toBe(buybackOrgId);
    expect(await prisma.anomalyAlert.count()).toBe(0);
    await stranger.get('/api/v1/me/transfers?filter=INCOMING').expect(200);
  });
});
