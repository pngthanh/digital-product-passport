import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TestingModule } from '@nestjs/testing';
import { type JsonRpcSigner, Wallet } from 'ethers';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { AppConfigService } from '../../src/config/app-config.service.js';
import { ChainProviderService } from '../../src/infrastructure/blockchain/chain-provider.service.js';
import type { PrismaClient } from '../../src/infrastructure/database/generated/client.js';
import {
  CHAIN_READER,
  type ChainReader,
} from '../../src/modules/chain-sync/application/chain-reader.port.js';
import { IndexChainEvents } from '../../src/modules/chain-sync/index.js';
import { EthersChainReader } from '../../src/modules/chain-sync/infrastructure/ethers-chain.reader.js';
import { type LocalChain, startHardhatNode } from '../support/hardhat-chain.js';
import { createApiApp, createWorkerContext } from '../support/test-app.js';
import { createTestConfig, TEST_REGISTRAR_KEY } from '../support/test-config.js';
import { createTestPrisma, resetDatabase } from '../support/test-database.js';
import { authorize, submit } from '../support/wallet-flow.js';

const PASSWORD = 'mat khau dai';
/** Hardhat coi block mới nhất là finalized; giả lập chain có finality trễ 3 block như mạng thật. */
const FINALITY_LAG = 3n;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Đọc chain thật, nhưng block finalized lùi FINALITY_LAG block so với block mới nhất. */
class LaggingFinalityReader implements ChainReader {
  readonly chainId: number;

  constructor(private readonly inner: ChainReader) {
    this.chainId = inner.chainId;
  }

  getTransaction(txHash: string) {
    return this.inner.getTransaction(txHash);
  }

  getReceipt(txHash: string) {
    return this.inner.getReceipt(txHash);
  }

  getLatestBlockNumber() {
    return this.inner.getLatestBlockNumber();
  }

  async getFinalizedBlockNumber() {
    const latest = await this.inner.getLatestBlockNumber();
    return latest > FINALITY_LAG ? latest - FINALITY_LAG : 0n;
  }

  getBlock(blockNumber: bigint) {
    return this.inner.getBlock(blockNumber);
  }

  getLogs(filter: Parameters<ChainReader['getLogs']>[0]) {
    return this.inner.getLogs(filter);
  }
}

/**
 * M13 (độ bền): reorg trên Hardhat node thật bằng evm_snapshot/evm_revert. Giao dịch nằm ở block
 * chưa finalized rồi bị reorg mất thì event thành ORPHANED và không được chiếu; giao dịch gửi lại vào
 * block khác thì được chốt đúng một lần.
 */
describe('M13: reorg trước khi finalized (e2e, Hardhat node, finality trễ 3 block)', () => {
  let chain: LocalChain;
  let api: NestExpressApplication;
  let worker: TestingModule;
  let prisma: PrismaClient;
  let alice: JsonRpcSigner;
  let owner: TestAgent;

  async function head(): Promise<bigint> {
    return BigInt(await chain.provider.send('eth_blockNumber', []));
  }

  /** Chạy Indexer tới khi mốc finalized và mốc đã thấy bắt kịp chain. */
  async function index(): Promise<void> {
    const indexer = worker.get(IndexChainEvents);
    const latest = await head();
    for (let round = 0; round < 20; round += 1) {
      // ethers giữ số block mới nhất 250 ms; đợi để Worker đọc được block vừa đào.
      await sleep(300);
      await indexer.runOnce();
      const checkpoint = await prisma.indexerCheckpoint.findFirst();
      if (
        checkpoint &&
        checkpoint.lastFinalizedBlock >= latest - FINALITY_LAG &&
        checkpoint.lastObservedBlock >= latest
      ) {
        return;
      }
    }
    throw new Error('Indexer chưa bắt kịp sau 20 vòng');
  }

  async function mine(blocks: number): Promise<void> {
    for (let mined = 0; mined < blocks; mined += 1) {
      await chain.mine();
    }
  }

  async function walletStatus(): Promise<string | undefined> {
    const wallet = await prisma.partyWallet.findFirst({
      where: { address: alice.address.toLowerCase() },
    });
    return wallet?.status;
  }

  beforeAll(async () => {
    prisma = createTestPrisma();
    await resetDatabase(prisma);
    chain = await startHardhatNode();
    const registryAddress = await chain.deployPartyRegistry(new Wallet(TEST_REGISTRAR_KEY).address);
    const deployBlock = await chain.provider.getBlockNumber();
    await mine(4);
    const config = createTestConfig({
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      JWT_SECRET: process.env.JWT_SECRET ?? '',
      RPC_URL: chain.url,
      CHAIN_ID: '31337',
      PARTY_REGISTRY_ADDRESS: registryAddress,
      PARTY_REGISTRY_DEPLOY_BLOCK: String(deployBlock),
    });
    api = await createApiApp({ config });
    worker = await createWorkerContext(config, {
      customize: (builder) =>
        builder.overrideProvider(CHAIN_READER).useFactory({
          factory: (provider: ChainProviderService, settings: AppConfigService) =>
            new LaggingFinalityReader(new EthersChainReader(provider, settings)),
          inject: [ChainProviderService, AppConfigService],
        }),
    });
    alice = await chain.signer(1);
    owner = request.agent(api.getHttpServer());
    await owner
      .post('/api/v1/auth/register')
      .send({ email: 'lan@example.com', password: PASSWORD, fullName: 'Lan' })
      .expect(201);
    await index();
  }, 120_000);

  afterAll(async () => {
    await api?.close();
    await worker?.close();
    await chain?.stop();
    await prisma?.$disconnect();
  });

  let orphanedTx = '';

  it('giao dịch ở block chưa finalized bị reorg mất: event thành ORPHANED, không chiếu, ví vẫn chờ', async () => {
    const snapshot: string = await chain.provider.send('evm_snapshot', []);
    const authorization = await authorize(owner, alice, 'LINK');
    orphanedTx = await submit(alice, authorization);
    await mine(1);
    await index();

    const observed = await prisma.blockchainEvent.findMany({ where: { txHash: orphanedTx } });
    expect(observed.length).toBeGreaterThan(0);
    expect(observed.every((event) => event.finalityStatus === 'PENDING')).toBe(true);
    expect(await walletStatus()).toBe('PENDING');

    // Reorg: bỏ block chứa giao dịch, chain đi tiếp bằng các block trống khác.
    expect(await chain.provider.send('evm_revert', [snapshot])).toBe(true);
    await mine(Number(FINALITY_LAG) + 3);
    await index();

    const orphaned = await prisma.blockchainEvent.findMany({ where: { txHash: orphanedTx } });
    expect(orphaned.map((event) => event.finalityStatus)).toEqual(observed.map(() => 'ORPHANED'));
    expect(orphaned.every((event) => event.orphanedAt !== null)).toBe(true);
    expect(await walletStatus()).toBe('PENDING');
    expect(await prisma.auditLog.count({ where: { action: 'WALLET_ACTIVATED' } })).toBe(0);
    expect(await prisma.anomalyAlert.count()).toBe(0);
  });

  it('gửi lại vào block khác: chốt đúng một lần, ví ACTIVE; event của block cũ vẫn ORPHANED', async () => {
    // Một giao dịch trống trước để nonce khác, giao dịch liên kết ví mới có hash khác hẳn.
    await (await alice.sendTransaction({ to: alice.address, value: 0n })).wait();
    const authorization = await authorize(owner, alice, 'LINK');
    const txHash = await submit(alice, authorization);
    expect(txHash).not.toBe(orphanedTx);
    await mine(1);
    await index();
    expect(await walletStatus()).toBe('PENDING');

    await mine(Number(FINALITY_LAG));
    await index();
    await index();

    const finalized = await prisma.blockchainEvent.findMany({ where: { txHash } });
    expect(finalized.length).toBeGreaterThan(0);
    expect(finalized.every((event) => event.finalityStatus === 'FINALIZED')).toBe(true);
    expect(await walletStatus()).toBe('ACTIVE');
    expect(await prisma.auditLog.count({ where: { action: 'WALLET_ACTIVATED' } })).toBe(1);
    const old = await prisma.blockchainEvent.findMany({ where: { txHash: orphanedTx } });
    expect(old.every((event) => event.finalityStatus === 'ORPHANED')).toBe(true);
    expect(await prisma.anomalyAlert.count()).toBe(0);
  });
});
