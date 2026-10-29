import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TestingModule } from '@nestjs/testing';
import { type JsonRpcSigner, Wallet } from 'ethers';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import type { PrismaClient } from '../../src/infrastructure/database/generated/client.js';
import { ConfirmTransactions, IndexChainEvents } from '../../src/modules/chain-sync/index.js';
import { ReconcilePartyWallets } from '../../src/modules/identity/index.js';
import { type LocalChain, startHardhatNode } from '../support/hardhat-chain.js';
import { createApiApp, createWorkerContext } from '../support/test-app.js';
import { createTestConfig, TEST_REGISTRAR_KEY } from '../support/test-config.js';
import { createTestPrisma, randomAddress, resetDatabase } from '../support/test-database.js';
import { authorize, submit } from '../support/wallet-flow.js';

const PASSWORD = 'mat khau dai';

/**
 * Indexer trên Hardhat node: event được chiếu kể cả khi web không báo txHash (tab bị đóng,
 * giao dịch gửi từ ví ngoài giao diện), và không bị chiếu lần hai khi txHash được báo sau đó.
 */
describe('M3: Indexer, chốt event đúng một lần và đối soát ví (e2e, Hardhat node)', () => {
  let chain: LocalChain;
  let api: NestExpressApplication;
  let worker: TestingModule;
  let prisma: PrismaClient;
  let registryAddress: string;
  let alice: JsonRpcSigner;
  let owner: TestAgent;
  let partyId: string;

  beforeAll(async () => {
    prisma = createTestPrisma();
    await resetDatabase(prisma);
    chain = await startHardhatNode();
    registryAddress = await chain.deployPartyRegistry(new Wallet(TEST_REGISTRAR_KEY).address);
    const deployBlock = await chain.provider.getBlockNumber();
    // Vài block trống để Indexer phải quét qua nhiều đoạn 2 block.
    for (let index = 0; index < 4; index += 1) {
      await chain.mine();
    }
    const config = createTestConfig({
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      JWT_SECRET: process.env.JWT_SECRET ?? '',
      AUTH_RATE_LIMIT_PER_MINUTE: '10000',
      RPC_URL: chain.url,
      CHAIN_ID: '31337',
      PARTY_REGISTRY_ADDRESS: registryAddress,
      PARTY_REGISTRY_DEPLOY_BLOCK: String(deployBlock),
      INDEXER_BLOCK_RANGE: '2',
    });
    api = await createApiApp({ config });
    worker = await createWorkerContext(config);
    alice = await chain.signer(1);

    owner = request.agent(api.getHttpServer());
    const registered = await owner
      .post('/api/v1/auth/register')
      .send({ email: 'lan@example.com', password: PASSWORD, fullName: 'Lan' })
      .expect(201);
    partyId = registered.body.party.partyId;
  }, 120_000);

  afterAll(async () => {
    await api?.close();
    await worker?.close();
    await chain?.stop();
    await prisma?.$disconnect();
  });

  async function indexUntilCaughtUp(): Promise<number> {
    const indexer = worker.get(IndexChainEvents);
    // Gọi thẳng eth_blockNumber: getBlockNumber() của ethers giữ kết quả cũ trong 250 ms.
    const head = BigInt(await chain.provider.send('eth_blockNumber', []));
    let finalized = 0;
    for (let round = 0; round < 20; round += 1) {
      finalized += (await indexer.runOnce()).finalized;
      const checkpoint = await prisma.indexerCheckpoint.findFirst();
      if (checkpoint && checkpoint.lastFinalizedBlock >= head) {
        return finalized;
      }
      // ethers giữ số block mới nhất trong 250 ms; đợi để vòng sau đọc được block vừa đào.
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error('Indexer chưa bắt kịp sau 20 vòng');
  }

  it('event không được web báo txHash vẫn được Indexer chiếu: ví thành ACTIVE', async () => {
    const authorization = await authorize(owner, alice, 'LINK');
    const txHash = await submit(alice, authorization);

    // Constructor phát 2 RoleGranted, TreasuryUpdated, FeeUpdated; cộng PartyRegistered của ví.
    expect(await indexUntilCaughtUp()).toBe(5);

    const me = await owner.get('/api/v1/auth/me').expect(200);
    expect(me.body.party).toMatchObject({ partyId, registeredOnChain: true });
    expect(me.body.wallets[0]).toMatchObject({
      address: alice.address,
      status: 'ACTIVE',
      linkTxHash: txHash,
    });
    expect(await prisma.blockchainEvent.findFirstOrThrow({ where: { txHash } })).toMatchObject({
      eventName: 'PartyRegistered',
      finalityStatus: 'FINALIZED',
      correlationKey: partyId,
      actorAddress: alice.address.toLowerCase(),
    });
    const checkpoint = await prisma.indexerCheckpoint.findFirstOrThrow();
    const head = await chain.provider.getBlock('latest');
    expect(checkpoint).toMatchObject({
      chainId: 31337,
      contractAddress: registryAddress.toLowerCase(),
      lastFinalizedBlock: BigInt(head?.number ?? -1),
      lastFinalizedBlockHash: head?.hash,
    });
  });

  it('web báo txHash sau khi Indexer đã kích hoạt ví: vẫn 202, chỉ ghi chain_transactions', async () => {
    const event = await prisma.blockchainEvent.findFirstOrThrow({
      where: { eventName: 'PartyRegistered' },
    });
    const wallet = await prisma.partyWallet.findUniqueOrThrow({
      where: { address: alice.address.toLowerCase() },
    });
    const reported = await owner
      .post(`/api/v1/me/wallet-links/${wallet.id}/transaction`)
      .send({ txHash: event.txHash })
      .expect(202);
    expect(reported.body).toMatchObject({ status: 'ACTIVE', linkTxHash: event.txHash });

    expect((await worker.get(ConfirmTransactions).runOnce()).finalized).toBe(1);

    const chainTx = await prisma.chainTransaction.findUniqueOrThrow({
      where: { txHash: event.txHash },
    });
    expect(chainTx.txStatus).toBe('CONFIRMED');
    expect(await prisma.blockchainEvent.count({ where: { eventName: 'PartyRegistered' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'WALLET_ACTIVATED' } })).toBe(1);
  });

  it('chạy Indexer lại không tạo event hay audit trùng', async () => {
    await chain.mine();

    expect(await indexUntilCaughtUp()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'WALLET_ACTIVATED' } })).toBe(1);
  });

  it('đối soát: khớp thì không cảnh báo; CSDL bị sửa lệch on-chain thì có một cảnh báo HIGH', async () => {
    const reconcile = worker.get(ReconcilePartyWallets);
    expect(await reconcile.runOnce()).toMatchObject({ checked: 1, mismatched: 0, raised: 0 });

    const tampered = randomAddress();
    await prisma.partyWallet.update({
      where: { address: alice.address.toLowerCase() },
      data: { address: tampered },
    });
    expect(await reconcile.runOnce()).toMatchObject({ mismatched: 1, raised: 1 });
    expect(await reconcile.runOnce()).toMatchObject({ mismatched: 1, raised: 0 });

    const alert = await prisma.anomalyAlert.findFirstOrThrow();
    expect(alert).toMatchObject({
      ruleCode: 'PARTY_WALLET_MISMATCH',
      severity: 'HIGH',
      alertStatus: 'OPEN',
      details: {
        chainPartyId: partyId,
        chainWallet: alice.address.toLowerCase(),
        databaseWallet: tampered,
      },
    });
    expect(await prisma.anomalyAlert.count()).toBe(1);
  });

  it('/health/ready báo Indexer đã bắt kịp chain', async () => {
    const response = await request(api.getHttpServer()).get('/api/v1/health/ready').expect(200);

    expect(response.body.components.indexer).toMatchObject({
      status: 'up',
      details: { trackedContracts: 1, lagBlocks: 0 },
    });
  });
});
