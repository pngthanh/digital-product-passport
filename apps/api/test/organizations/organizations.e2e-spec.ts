import {
  type AdminDecisionCall,
  FEE_ACTION_IDS,
  MANUFACTURER_ROLE,
  type MyOrganizationView,
  type OrganizationApplicationAuthorization,
  type OrganizationDetailView,
  PARTY_REGISTRY_ABI,
} from '@dpp/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TestingModule } from '@nestjs/testing';
import { Contract, type JsonRpcSigner, parseEther, Wallet } from 'ethers';
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
const FEE = parseEther('8');

const APPLICATION = {
  name: 'ABC Electronics',
  taxCode: '0312345678',
  orgType: 'MANUFACTURER',
  contactEmail: 'lien.he@abc.vn',
  contactPhone: '028 3812 3456',
  address: '12 Nguyễn Văn Cừ, Cần Thơ',
};

/**
 * M4 trọn luồng trên Hardhat node: người đại diện nộp đơn bằng ví cá nhân kèm 8 MON (ETH ở local),
 * Admin từ chối, doanh nghiệp rút phí và nộp lại, Admin duyệt (phí về Treasury), khoá, đổi phí.
 */
describe('ORG-01..04, ORG-06: doanh nghiệp và phí (e2e, Hardhat node)', () => {
  let chain: LocalChain;
  let api: NestExpressApplication;
  let worker: TestingModule;
  let prisma: PrismaClient;
  let registry: Contract;
  let adminWallet: JsonRpcSigner;
  let representativeWallet: JsonRpcSigner;
  let treasury: JsonRpcSigner;
  let admin: TestAgent;
  let representative: TestAgent;
  let organizationPartyId: string;

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
    // Gọi thẳng eth_blockNumber: getBlockNumber() của ethers giữ kết quả cũ trong 250 ms.
    const head = BigInt(await chain.provider.send('eth_blockNumber', []));
    for (let round = 0; round < 20; round += 1) {
      await indexer.runOnce();
      const checkpoint = await prisma.indexerCheckpoint.findFirst();
      if (checkpoint && checkpoint.lastFinalizedBlock >= head) {
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

  async function applyOrganization(body: Record<string, unknown>): Promise<string> {
    const response = await representative
      .post('/api/v1/me/organization/application')
      .send(body)
      .expect(201);
    const authorization: OrganizationApplicationAuthorization = response.body;
    const tx = await registry.connect(representativeWallet).getFunction('applyOrganization')(
      authorization.partyId,
      authorization.role,
      authorization.profileHash,
      BigInt(authorization.deadline),
      authorization.signature,
      { value: BigInt(authorization.feeWei) },
    );
    await tx.wait();
    await representative
      .post('/api/v1/me/organization/transactions')
      .send({ txHash: tx.hash, kind: 'applyOrganization' })
      .expect(202);
    await sync();
    return authorization.partyId;
  }

  async function adminCall(method: string, ...args: unknown[]): Promise<void> {
    const tx = await registry.connect(adminWallet).getFunction(method)(...args);
    await tx.wait();
    await admin.post('/api/v1/admin/transactions').send({ txHash: tx.hash, method }).expect(202);
    await sync();
  }

  async function myOrganization(): Promise<MyOrganizationView> {
    return (await representative.get('/api/v1/me/organization').expect(200)).body;
  }

  beforeAll(async () => {
    prisma = createTestPrisma();
    await resetDatabase(prisma);
    chain = await startHardhatNode();
    [adminWallet, representativeWallet, treasury] = await Promise.all([
      chain.signer(0),
      chain.signer(1),
      chain.signer(5),
    ]);
    const registryAddress = await chain.deployPartyRegistry(
      new Wallet(TEST_REGISTRAR_KEY).address,
      { treasury: treasury.address, registrationFee: FEE },
    );
    registry = new Contract(registryAddress, PARTY_REGISTRY_ABI, chain.provider);
    const config = createTestConfig({
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      JWT_SECRET: process.env.JWT_SECRET ?? '',
      AUTH_RATE_LIMIT_PER_MINUTE: '10000',
      RPC_URL: chain.url,
      CHAIN_ID: '31337',
      PARTY_REGISTRY_ADDRESS: registryAddress,
      PARTY_REGISTRY_DEPLOY_BLOCK: String(await chain.provider.getBlockNumber()),
    });
    api = await createApiApp({ config });
    worker = await createWorkerContext(config);

    admin = await register('admin@dpp.vn', 'Quản trị viên');
    await prisma.user.update({ where: { email: 'admin@dpp.vn' }, data: { systemRole: 'ADMIN' } });
    await linkWallet(admin, adminWallet);
    representative = await register('dai.dien@abc.vn', 'Lê Văn Đại Diện');
    await linkWallet(representative, representativeWallet);
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await worker?.close();
    await chain?.stop();
    await prisma?.$disconnect();
  });

  it('chưa liên kết ví MetaMask thì chưa nộp được đơn', async () => {
    const outsider = await register('chua.co.vi@xyz.vn', 'Chưa Có Ví');

    const response = await outsider
      .post('/api/v1/me/organization/application')
      .send({ ...APPLICATION, taxCode: '0399999999' })
      .expect(409);
    expect(response.body.code).toBe('PERSONAL_WALLET_REQUIRED');
  });

  it('ORG-01: ví cá nhân nộp đơn kèm 8 MON; Indexer ghi đơn chờ duyệt và phí đang giữ', async () => {
    const before = await myOrganization();
    expect(before.organization).toBeNull();
    expect(before.registrationFee?.amountWei).toBe(FEE.toString());

    organizationPartyId = await applyOrganization(APPLICATION);

    const { organization } = await myOrganization();
    expect(organization).toMatchObject({
      partyId: organizationPartyId,
      name: 'ABC Electronics',
      contactPhone: '02838123456',
      stage: 'PENDING',
      representative: { email: 'dai.dien@abc.vn' },
    });
    expect(organization?.feePayments).toEqual([
      expect.objectContaining({
        amountWei: FEE.toString(),
        feeStatus: 'ESCROWED',
        payerAddress: representativeWallet.address,
      }),
    ]);
    const party = await prisma.party.findUniqueOrThrow({ where: { id: organization?.id } });
    expect(party).toMatchObject({ partyType: 'ORGANIZATION', chainPartyId: organizationPartyId });
  });

  it('tài khoản thường không vào được khu Quản trị', async () => {
    const response = await representative.get('/api/v1/admin/overview').expect(403);
    expect(response.body.code).toBe('ADMIN_REQUIRED');
  });

  it('ORG-03: Admin từ chối kèm lý do; người đại diện rút 8 MON về ví rồi sửa hồ sơ, nộp lại', async () => {
    const overview = await admin.get('/api/v1/admin/overview').expect(200);
    expect(overview.body).toMatchObject({
      adminWallet: adminWallet.address,
      walletHasAdminRole: true,
      counts: { PENDING: 1 },
    });
    const pending = await admin.get('/api/v1/admin/organizations?stage=PENDING').expect(200);
    expect(pending.body.items).toHaveLength(1);

    const decision = await admin
      .post(`/api/v1/admin/organizations/${pending.body.items[0].id}/decisions`)
      .send({ decision: 'REJECT', reason: 'Địa chỉ chưa khớp giấy phép' })
      .expect(201);
    const call: AdminDecisionCall = decision.body;
    expect(call.method).toBe('rejectOrganization');
    await adminCall('rejectOrganization', call.partyId, call.reasonHash);

    const rejected = (await myOrganization()).organization;
    expect(rejected).toMatchObject({
      stage: 'REJECTED',
      statusReason: 'Địa chỉ chưa khớp giấy phép',
      refundableWei: FEE.toString(),
    });

    const refund = await registry.connect(representativeWallet).getFunction('withdrawRefund')(
      organizationPartyId,
    );
    await refund.wait();
    await representative
      .post('/api/v1/me/organization/transactions')
      .send({ txHash: refund.hash, kind: 'withdrawRefund' })
      .expect(202);
    await sync();
    expect((await myOrganization()).organization).toMatchObject({ refundableWei: '0' });

    await applyOrganization({ ...APPLICATION, address: '15 Nguyễn Văn Cừ, Cần Thơ' });
    const resubmitted = (await myOrganization()).organization;
    expect(resubmitted).toMatchObject({
      stage: 'PENDING',
      statusReason: null,
      address: '15 Nguyễn Văn Cừ, Cần Thơ',
    });
    expect(resubmitted?.feePayments.map((payment) => payment.feeStatus)).toEqual([
      'ESCROWED',
      'REFUNDED',
    ]);
  });

  it('ORG-02: Admin duyệt, 8 MON chuyển về ví Treasury, doanh nghiệp có role trên contract', async () => {
    const treasuryBefore = await chain.provider.getBalance(treasury.address);

    await adminCall('approveOrganization', organizationPartyId);

    const approved = (await myOrganization()).organization;
    expect(approved?.stage).toBe('AUTHORIZED');
    expect(approved?.feePayments[0]?.feeStatus).toBe('SETTLED');
    expect(await chain.provider.getBalance(treasury.address)).toBe(treasuryBefore + FEE);
    expect(
      await registry.getFunction('authorizedOrganizationOf')(
        representativeWallet.address,
        MANUFACTURER_ROLE,
      ),
    ).toBe(organizationPartyId);

    const edit = await representative
      .post('/api/v1/me/organization/application')
      .send(APPLICATION)
      .expect(409);
    expect(edit.body.code).toBe('ORGANIZATION_APPLICATION_LOCKED');
  });

  it('ORG-04: Admin khoá doanh nghiệp kèm lý do', async () => {
    const { organization } = await myOrganization();
    const decision = await admin
      .post(`/api/v1/admin/organizations/${organization?.id}/decisions`)
      .send({ decision: 'DISABLE', reason: 'Vi phạm điều khoản' })
      .expect(201);

    await adminCall('disableOrganization', decision.body.partyId, decision.body.reasonHash);

    expect((await myOrganization()).organization).toMatchObject({
      stage: 'DISABLED',
      statusReason: 'Vi phạm điều khoản',
    });
  });

  it('Admin xem đủ hồ sơ, từng lần nộp (kể cả lần bị từ chối) và nhật ký on-chain có mã giao dịch', async () => {
    const { organization } = await myOrganization();
    const response = await admin.get(`/api/v1/admin/organizations/${organization?.id}`).expect(200);
    const detail: OrganizationDetailView = response.body;

    expect(detail.organization).toMatchObject({
      address: '15 Nguyễn Văn Cừ, Cần Thơ',
      contactPhone: '02838123456',
      representative: { email: 'dai.dien@abc.vn' },
    });
    const [second, first] = detail.applications;
    expect(first).toMatchObject({
      round: 1,
      status: 'REJECTED',
      profile: { address: '12 Nguyễn Văn Cừ, Cần Thơ' },
      profileMatchesChain: true,
      applicantAddress: representativeWallet.address,
      decisionReason: 'Địa chỉ chưa khớp giấy phép',
      reasonMatchesChain: true,
      decidedByAddress: adminWallet.address,
      fee: { feeStatus: 'REFUNDED', amountWei: FEE.toString() },
    });
    expect(first?.fee?.refundTxHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(second).toMatchObject({
      round: 2,
      status: 'AUTHORIZED',
      profile: { address: '15 Nguyễn Văn Cừ, Cần Thơ' },
      profileMatchesChain: true,
      decisionReason: null,
      fee: { feeStatus: 'SETTLED' },
    });
    expect(detail.chainLog.map((event) => event.eventName)).toEqual([
      'PartyRegistered',
      'OrganizationApplied',
      'FeePaid',
      'OrganizationRejected',
      'FeeRefunded',
      'OrganizationApplied',
      'FeePaid',
      'OrganizationApproved',
      'FeeSettled',
      'OrganizationDisabled',
    ]);
    expect(detail.chainLog[3]?.txHash).toBe(first?.decidedTxHash);

    // Người đại diện cũng thấy đúng lịch sử đó.
    expect((await myOrganization()).history.applications).toHaveLength(2);
  });

  it('ORG-06: Admin đổi phí và ví Treasury; Indexer cập nhật fee_policies', async () => {
    const newTreasury = await chain.signer(6);

    await adminCall('setFee', FEE_ACTION_IDS.ORG_REGISTRATION, parseEther('5'));
    await adminCall('setTreasury', newTreasury.address);

    const overview = await admin.get('/api/v1/admin/overview').expect(200);
    expect(overview.body.registrationFee).toEqual({
      action: 'ORG_REGISTRATION',
      amountWei: parseEther('5').toString(),
      treasury: newTreasury.address,
    });
    const actions = (await prisma.auditLog.findMany()).map((log) => log.action);
    expect(actions.filter((action) => action === 'ORG_APPLIED')).toHaveLength(2);
    expect(actions).toEqual(
      expect.arrayContaining(['ORG_REJECTED', 'ORG_APPROVED', 'ORG_DISABLED', 'ORG_FEE_REFUNDED']),
    );
  });
});
