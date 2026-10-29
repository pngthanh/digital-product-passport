import { PARTY_REGISTRY_ABI } from '@dpp/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TestingModule } from '@nestjs/testing';
import { Contract, type JsonRpcSigner, Wallet, ZeroHash } from 'ethers';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import type { PrismaClient } from '../../src/infrastructure/database/generated/client.js';
import { ConfirmTransactions } from '../../src/modules/chain-sync/index.js';
import { type LocalChain, startHardhatNode } from '../support/hardhat-chain.js';
import { createApiApp, createWorkerContext } from '../support/test-app.js';
import { createTestConfig, TEST_REGISTRAR_KEY } from '../support/test-config.js';
import { createTestPrisma, resetDatabase } from '../support/test-database.js';
import { authorize, submit } from '../support/wallet-flow.js';

const PASSWORD = 'mat khau dai';

/**
 * Luồng thật từ đầu tới cuối trên Hardhat node: API cấp giấy phép, ví người dùng tự gửi
 * giao dịch và trả gas, Worker chốt khi finalized rồi chiếu event sang CSDL.
 */
describe('ACC-03, ACC-04: liên kết và xoay ví MetaMask (e2e, Hardhat node)', () => {
  let chain: LocalChain;
  let api: NestExpressApplication;
  let worker: TestingModule;
  let prisma: PrismaClient;
  let registryAddress: string;
  let alice: JsonRpcSigner;
  let bob: JsonRpcSigner;
  let carol: JsonRpcSigner;
  let owner: TestAgent;
  let partyId: string;

  beforeAll(async () => {
    prisma = createTestPrisma();
    await resetDatabase(prisma);
    chain = await startHardhatNode();
    registryAddress = await chain.deployPartyRegistry(new Wallet(TEST_REGISTRAR_KEY).address);
    const config = createTestConfig({
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      JWT_SECRET: process.env.JWT_SECRET ?? '',
      AUTH_RATE_LIMIT_PER_MINUTE: '10000',
      RPC_URL: chain.url,
      CHAIN_ID: '31337',
      PARTY_REGISTRY_ADDRESS: registryAddress,
    });
    api = await createApiApp({ config });
    worker = await createWorkerContext(config);
    [alice, bob, carol] = await Promise.all([chain.signer(1), chain.signer(2), chain.signer(3)]);

    owner = request.agent(api.getHttpServer());
    const registered = await owner
      .post('/api/v1/auth/register')
      .send({ email: 'giang@example.com', password: PASSWORD, fullName: 'Giang' })
      .expect(201);
    partyId = registered.body.party.partyId;
  }, 120_000);

  afterAll(async () => {
    await api?.close();
    await worker?.close();
    await chain?.stop();
    await prisma?.$disconnect();
  });

  async function finalizeAll(): Promise<void> {
    const confirm = worker.get(ConfirmTransactions);
    for (let round = 0; round < 10; round += 1) {
      if ((await confirm.runOnce()).waiting === 0) {
        return;
      }
      await chain.mine();
    }
    throw new Error('Giao dịch chưa được chốt sau 10 vòng');
  }

  it('ACC-03: ví MetaMask tự gửi registerUser, Worker kích hoạt ví khi finalized', async () => {
    const authorization = await authorize(owner, alice, 'LINK');
    expect(authorization).toMatchObject({
      method: 'registerUser',
      partyId,
      wallet: alice.address,
      contractAddress: registryAddress,
    });

    const txHash = await submit(alice, authorization);
    const reported = await owner
      .post(`/api/v1/me/wallet-links/${authorization.walletId}/transaction`)
      .send({ txHash })
      .expect(202);
    expect(reported.body).toMatchObject({ status: 'PENDING', linkTxHash: txHash });

    await finalizeAll();

    const me = await owner.get('/api/v1/auth/me').expect(200);
    expect(me.body.party).toMatchObject({ partyId, registeredOnChain: true });
    expect(me.body.wallets[0]).toMatchObject({
      address: alice.address,
      status: 'ACTIVE',
      custodyType: 'NON_CUSTODIAL',
      walletRole: 'PERSONAL',
      linkTxHash: txHash,
    });

    const event = await prisma.blockchainEvent.findFirstOrThrow({ where: { txHash } });
    expect(event).toMatchObject({
      chainId: 31337,
      contractAddress: registryAddress.toLowerCase(),
      eventName: 'PartyRegistered',
      finalityStatus: 'FINALIZED',
      correlationKey: partyId,
      actorAddress: alice.address.toLowerCase(),
    });
    expect(event.payload).toMatchObject({ args: { wallet: alice.address.toLowerCase(), kind: 1 } });
    const chainTx = await prisma.chainTransaction.findUniqueOrThrow({ where: { txHash } });
    expect(chainTx).toMatchObject({ txStatus: 'CONFIRMED', method: 'registerUser' });
    expect(chainTx.gasUsed).toBeGreaterThan(0n);

    const registry = new Contract(registryAddress, PARTY_REGISTRY_ABI, chain.provider);
    expect(await registry.getFunction('partyOf')(alice.address)).toBe(partyId);
    const actions = (await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map(
      (log) => log.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        'WALLET_LINK_AUTHORIZED',
        'WALLET_LINK_SUBMITTED',
        'WALLET_ACTIVATED',
      ]),
    );
  });

  it('ACC-04: nhập lại mật khẩu, ví mới gửi rotateWallet; ví cũ thành ROTATED', async () => {
    const challenge = await owner
      .post('/api/v1/me/wallet-links/challenge')
      .send({ address: bob.address, purpose: 'ROTATE' })
      .expect(201);
    const withoutPassword = await owner
      .post('/api/v1/me/wallet-links/authorize')
      .send({
        challengeToken: challenge.body.challengeToken,
        signature: await bob.signMessage(challenge.body.message),
      })
      .expect(403);
    expect(withoutPassword.body.code).toBe('PASSWORD_CONFIRMATION_FAILED');

    const authorization = await authorize(owner, bob, 'ROTATE', PASSWORD);
    expect(authorization).toMatchObject({ method: 'rotateWallet', previousWallet: alice.address });
    const txHash = await submit(bob, authorization);
    await owner
      .post(`/api/v1/me/wallet-links/${authorization.walletId}/transaction`)
      .send({ txHash })
      .expect(202);
    await finalizeAll();

    const me = await owner.get('/api/v1/auth/me').expect(200);
    const byAddress = Object.fromEntries(
      me.body.wallets.map((wallet: { address: string; status: string }) => [
        wallet.address,
        wallet.status,
      ]),
    );
    expect(byAddress).toEqual({ [bob.address]: 'ACTIVE', [alice.address]: 'ROTATED' });
    const rotated = await prisma.partyWallet.findUniqueOrThrow({
      where: { address: alice.address.toLowerCase() },
    });
    expect(rotated.revokedAt).not.toBeNull();

    const registry = new Contract(registryAddress, PARTY_REGISTRY_ABI, chain.provider);
    expect(await registry.getFunction('partyOf')(alice.address)).toBe(ZeroHash);
    expect(await registry.getFunction('walletOf')(partyId)).toBe(bob.address);
  });

  it('ví đã từng liên kết không dùng lại được cho tài khoản khác', async () => {
    const other = request.agent(api.getHttpServer());
    await other
      .post('/api/v1/auth/register')
      .send({ email: 'hoa@example.com', password: PASSWORD, fullName: 'Hoa' })
      .expect(201);

    const response = await other
      .post('/api/v1/me/wallet-links/challenge')
      .send({ address: alice.address, purpose: 'LINK' })
      .expect(409);
    expect(response.body.code).toBe('WALLET_ALREADY_USED');
  });

  it('báo txHash của giao dịch không do ví đang liên kết gửi trả 422 TX_MISMATCH', async () => {
    const other = request.agent(api.getHttpServer());
    await other
      .post('/api/v1/auth/register')
      .send({ email: 'khanh@example.com', password: PASSWORD, fullName: 'Khánh' })
      .expect(201);
    const authorization = await authorize(other, carol, 'LINK');
    const unrelated = await bob.sendTransaction({ to: carol.address, value: 1n });
    await unrelated.wait();

    const response = await other
      .post(`/api/v1/me/wallet-links/${authorization.walletId}/transaction`)
      .send({ txHash: unrelated.hash })
      .expect(422);
    expect(response.body.code).toBe('TX_MISMATCH');
  });
});
