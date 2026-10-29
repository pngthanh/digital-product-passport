import {
  partyIdFromUuid,
  partyRegistryDomain,
  WALLET_BINDING_TYPES,
  type WalletLinkPurpose,
} from '@dpp/shared';
import { type BaseWallet, verifyTypedData, Wallet, ZeroAddress } from 'ethers';
import {
  FakeChallengeTokens,
  FakePartyRegistryReader,
  FakePasswordHasher,
  FakeTransactionTracker,
  InMemoryIdentityStore,
  recordingAudit,
} from '../../../../test/support/identity-fakes.js';
import {
  createTestConfig,
  TEST_PARTY_REGISTRY,
  TEST_REGISTRAR_KEY,
  TestClock,
} from '../../../../test/support/test-config.js';
import { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import {
  BlockchainUnavailableError,
  ChainOutOfSyncError,
  IdentityChainNotConfiguredError,
  PasswordConfirmationError,
  WalletAlreadyLinkedError,
  WalletAlreadyUsedError,
  WalletChallengeInvalidError,
  WalletLinkInProgressError,
  WalletLinkNotFoundError,
  WalletSignatureMismatchError,
} from '../domain/identity.errors.js';
import { Eip712WalletLinkAuthorizer } from '../infrastructure/eip712-wallet-link.authorizer.js';
import { AuthorizeWalletLink } from './authorize-wallet-link.use-case.js';
import { IssueWalletChallenge } from './issue-wallet-challenge.use-case.js';
import type { WalletLinkSettings } from './ports/wallet-link-settings.js';
import { RecordWalletLinkTransaction } from './record-wallet-link-transaction.use-case.js';

const client = { ipAddress: '127.0.0.1', userAgent: 'vitest' };
const CHAIN_ID = 31337;
const settings: WalletLinkSettings = {
  siweDomain: 'localhost:3000',
  siweUri: 'http://localhost:3000',
  chainId: CHAIN_ID,
  authorizationTtlSeconds: 900,
};
const registrar = new Wallet(TEST_REGISTRAR_KEY);
const metamask = Wallet.createRandom();
const otherMetamask = Wallet.createRandom();
const lower = (wallet: BaseWallet) => wallet.address.toLowerCase();

async function setup(configOverrides: Record<string, string> = {}) {
  const store = new InMemoryIdentityStore();
  const hasher = new FakePasswordHasher();
  const challenges = new FakeChallengeTokens();
  const reader = new FakePartyRegistryReader();
  const tracker = new FakeTransactionTracker();
  const clock = new TestClock();
  const { audit, writer } = recordingAudit();
  const authorizer = new Eip712WalletLinkAuthorizer(createTestConfig(configOverrides));
  const { account } = await store.createWithParty({
    email: 'chi@example.com',
    passwordHash: await hasher.hash('mat khau dai'),
    fullName: 'Chi',
  });
  const user = {
    id: account.id,
    email: account.email,
    fullName: account.fullName,
    systemRole: account.systemRole,
  };
  const chainPartyId = partyIdFromUuid(store.partyOfUser(account.id).id);
  return {
    store,
    reader,
    tracker,
    writer,
    user,
    chainPartyId,
    issue: new IssueWalletChallenge(store, challenges, authorizer, settings, clock, tracker),
    authorize: new AuthorizeWalletLink(
      store,
      store,
      hasher,
      challenges,
      authorizer,
      reader,
      settings,
      clock,
      tracker,
      audit,
    ),
    record: new RecordWalletLinkTransaction(store, tracker, audit),
  };
}

type Context = Awaited<ReturnType<typeof setup>>;

/** Mô phỏng web: xin challenge, để ví ký thông điệp EIP-4361, rồi xin giấy phép. */
async function signAndAuthorize(
  context: Context,
  wallet: BaseWallet,
  purpose: WalletLinkPurpose,
  password?: string,
) {
  const challenge = await context.issue.execute(context.user, { address: wallet.address, purpose });
  const signature = await wallet.signMessage(challenge.message);
  return context.authorize.execute(
    context.user,
    { challengeToken: challenge.challengeToken, signature, password },
    client,
  );
}

describe('ACC-03 Liên kết ví MetaMask', () => {
  it('thông điệp EIP-4361 nêu đúng domain, ví checksum và chain', async () => {
    const context = await setup();

    const challenge = await context.issue.execute(context.user, {
      address: lower(metamask),
      purpose: 'LINK',
    });

    expect(challenge.address).toBe(metamask.address);
    expect(challenge.message).toContain(`localhost:3000 wants you to sign in`);
    expect(challenge.message).toContain(`\n${metamask.address}\n`);
    expect(challenge.message).toContain('Chain ID: 31337');
    expect(challenge.expiresAt).toBe('2026-10-28T08:05:00.000Z');
  });

  it('chữ ký hợp lệ: ghi ví PENDING và cấp giấy phép registerUser do registrar ký', async () => {
    const context = await setup();

    const authorization = await signAndAuthorize(context, metamask, 'LINK');

    expect(authorization).toMatchObject({
      method: 'registerUser',
      chainId: CHAIN_ID,
      contractAddress: TEST_PARTY_REGISTRY,
      partyId: context.chainPartyId,
      wallet: metamask.address,
      previousWallet: ZeroAddress,
      deadline: String(Date.parse('2026-10-28T08:00:00Z') / 1000 + 900),
    });
    const signer = verifyTypedData(
      partyRegistryDomain(CHAIN_ID, TEST_PARTY_REGISTRY),
      WALLET_BINDING_TYPES,
      {
        partyId: authorization.partyId,
        wallet: authorization.wallet,
        previousWallet: authorization.previousWallet,
        deadline: BigInt(authorization.deadline),
      },
      authorization.signature,
    );
    expect(signer).toBe(registrar.address);
    expect(await context.store.findByAddress(lower(metamask))).toMatchObject({
      id: authorization.walletId,
      status: 'PENDING',
      custodyType: 'NON_CUSTODIAL',
      walletRole: 'PERSONAL',
    });
    expect(context.writer.actions()).toEqual(['WALLET_LINK_AUTHORIZED']);
  });

  it('từ chối chữ ký của ví khác ví trong challenge', async () => {
    const context = await setup();
    const challenge = await context.issue.execute(context.user, {
      address: metamask.address,
      purpose: 'LINK',
    });

    await expect(
      context.authorize.execute(
        context.user,
        {
          challengeToken: challenge.challengeToken,
          signature: await otherMetamask.signMessage(challenge.message),
        },
        client,
      ),
    ).rejects.toBeInstanceOf(WalletSignatureMismatchError);
  });

  it('từ chối challenge cấp cho người dùng khác', async () => {
    const context = await setup();
    const challenge = await context.issue.execute(context.user, {
      address: metamask.address,
      purpose: 'LINK',
    });

    await expect(
      context.authorize.execute(
        { ...context.user, id: 'nguoi-khac' },
        {
          challengeToken: challenge.challengeToken,
          signature: await metamask.signMessage(challenge.message),
        },
        client,
      ),
    ).rejects.toBeInstanceOf(WalletChallengeInvalidError);
  });

  it('từ chối ví đã thuộc người khác trong CSDL hoặc đã dùng trên chain', async () => {
    const context = await setup();
    context.reader.usedWallets.add(lower(otherMetamask));

    await expect(signAndAuthorize(context, otherMetamask, 'LINK')).rejects.toBeInstanceOf(
      WalletAlreadyUsedError,
    );

    const other = await context.store.createWithParty({
      email: 'khac@example.com',
      passwordHash: 'x',
      fullName: 'Khác',
    });
    context.store.seedWallet(other.account.id, lower(metamask), 'ACTIVE');
    await expect(
      context.issue.execute(context.user, { address: metamask.address, purpose: 'LINK' }),
    ).rejects.toBeInstanceOf(WalletAlreadyUsedError);
  });

  it('không cho liên kết khi đã có ví; dùng chức năng đổi ví', async () => {
    const context = await setup();
    context.store.seedWallet(context.user.id, lower(otherMetamask), 'ACTIVE');

    await expect(
      context.issue.execute(context.user, { address: metamask.address, purpose: 'LINK' }),
    ).rejects.toBeInstanceOf(WalletAlreadyLinkedError);
  });

  it('báo chưa đồng bộ khi chain đã có ví mà CSDL chưa ghi nhận', async () => {
    const context = await setup();
    context.reader.walletByParty.set(context.chainPartyId, lower(otherMetamask));

    await expect(signAndAuthorize(context, metamask, 'LINK')).rejects.toBeInstanceOf(
      ChainOutOfSyncError,
    );
  });

  it('báo blockchain không khả dụng khi RPC lỗi', async () => {
    const context = await setup();
    context.reader.failing = true;

    await expect(signAndAuthorize(context, metamask, 'LINK')).rejects.toBeInstanceOf(
      BlockchainUnavailableError,
    );
  });

  it('báo chưa cấu hình khi thiếu địa chỉ PartyRegistry', async () => {
    const context = await setup({ PARTY_REGISTRY_ADDRESS: '' });

    await expect(
      context.issue.execute(context.user, { address: metamask.address, purpose: 'LINK' }),
    ).rejects.toBeInstanceOf(IdentityChainNotConfiguredError);
  });

  it('báo txHash: theo dõi giao dịch registerUser từ đúng ví', async () => {
    const context = await setup();
    const authorization = await signAndAuthorize(context, metamask, 'LINK');
    const txHash = `0x${'ab'.repeat(32)}`;

    const wallet = await context.record.execute(
      context.user,
      authorization.walletId,
      txHash,
      client,
    );

    expect(wallet.linkTxHash).toBe(txHash);
    expect(context.tracker.tracked).toEqual([
      {
        txHash,
        contractName: 'PartyRegistry',
        expectedFrom: lower(metamask),
        expectedMethods: ['registerUser'],
        initiatedByUserId: context.user.id,
      },
    ]);
  });

  it('không cho mở yêu cầu mới khi giao dịch trước còn chờ chốt', async () => {
    const context = await setup();
    const authorization = await signAndAuthorize(context, metamask, 'LINK');
    await context.record.execute(
      context.user,
      authorization.walletId,
      `0x${'cd'.repeat(32)}`,
      client,
    );

    await expect(signAndAuthorize(context, otherMetamask, 'LINK')).rejects.toBeInstanceOf(
      WalletLinkInProgressError,
    );
  });

  it('Indexer kích hoạt ví trước khi web kịp báo txHash: vẫn nhận và theo dõi giao dịch', async () => {
    const context = await setup();
    const authorization = await signAndAuthorize(context, metamask, 'LINK');
    const txHash = `0x${'ab'.repeat(32)}`;
    await context.store.applyRegistration(
      {
        partyId: context.store.partyOfUser(context.user.id).id,
        chainPartyId: context.chainPartyId,
        address: lower(metamask),
        txHash,
        activatedAt: new Date(),
      },
      new TransactionScope({}),
    );

    const wallet = await context.record.execute(
      context.user,
      authorization.walletId,
      txHash,
      client,
    );

    expect(wallet).toMatchObject({ status: 'ACTIVE', linkTxHash: txHash });
    expect(context.tracker.tracked[0]?.expectedMethods).toEqual(['registerUser']);
    await expect(
      context.record.execute(context.user, authorization.walletId, `0x${'cd'.repeat(32)}`, client),
    ).rejects.toBeInstanceOf(WalletLinkNotFoundError);
  });

  it('báo không tìm thấy khi walletId không phải yêu cầu đang chờ của mình', async () => {
    const context = await setup();

    await expect(
      context.record.execute(context.user, 'khong-ton-tai', `0x${'ef'.repeat(32)}`, client),
    ).rejects.toBeInstanceOf(WalletLinkNotFoundError);
  });
});

/** Người dùng đã có ví ACTIVE trên cả CSDL và chain. */
async function linkedContext() {
  const context = await setup();
  context.store.seedWallet(context.user.id, lower(metamask), 'ACTIVE');
  context.reader.walletByParty.set(context.chainPartyId, lower(metamask));
  return context;
}

describe('ACC-04 Xoay ví cá nhân', () => {
  it('cần nhập lại đúng mật khẩu', async () => {
    const context = await linkedContext();

    await expect(signAndAuthorize(context, otherMetamask, 'ROTATE')).rejects.toBeInstanceOf(
      PasswordConfirmationError,
    );
    await expect(
      signAndAuthorize(context, otherMetamask, 'ROTATE', 'sai mat khau'),
    ).rejects.toBeInstanceOf(PasswordConfirmationError);
  });

  it('cấp giấy phép rotateWallet, ghi rõ ví bị thay', async () => {
    const context = await linkedContext();

    const authorization = await signAndAuthorize(context, otherMetamask, 'ROTATE', 'mat khau dai');

    expect(authorization).toMatchObject({
      method: 'rotateWallet',
      wallet: otherMetamask.address,
      previousWallet: metamask.address,
    });

    await context.record.execute(
      context.user,
      authorization.walletId,
      `0x${'12'.repeat(32)}`,
      client,
    );
    expect(context.tracker.tracked[0]?.expectedMethods).toEqual(['rotateWallet']);
  });
});
