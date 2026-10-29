import { partyIdFromUuid } from '@dpp/shared';
import { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import {
  FakePartyRegistryReader,
  FakeTransactionTracker,
  InMemoryIdentityStore,
  recordingAudit,
} from '../../../../test/support/identity-fakes.js';
import { createTestConfig, TestClock } from '../../../../test/support/test-config.js';
import type { ChainEvent } from '../../chain-sync/index.js';
import { Eip712WalletLinkAuthorizer } from '../infrastructure/eip712-wallet-link.authorizer.js';
import { ExpireWalletLinks } from './expire-wallet-links.use-case.js';
import { PartyRegistryProjector } from './party-registry.projector.js';

const scope = new TransactionScope({});
const OLD = '0x1111111111111111111111111111111111111111';
const NEW = '0x2222222222222222222222222222222222222222';
const blockTimestamp = new Date('2026-10-28T08:01:00Z');

function chainEvent(eventName: string, args: ChainEvent['args']): ChainEvent {
  return {
    chainId: 31337,
    contractName: 'PartyRegistry',
    contractAddress: '0x5fbdb2315678afecb367f032d93f642f64180aa3',
    eventName,
    args,
    blockNumber: 42n,
    blockHash: `0x${'aa'.repeat(32)}`,
    blockTimestamp,
    txHash: `0x${'bb'.repeat(32)}`,
    txIndex: 0,
    logIndex: 0,
    actorAddress: NEW,
    correlationKey: typeof args.partyId === 'string' ? args.partyId : null,
  };
}

async function setup() {
  const store = new InMemoryIdentityStore();
  const { audit, writer } = recordingAudit();
  const { account, partyId } = await store.createWithParty({
    email: 'dung@example.com',
    passwordHash: 'x',
    fullName: 'Dũng',
  });
  return {
    store,
    writer,
    userId: account.id,
    partyId,
    chainPartyId: partyIdFromUuid(partyId),
    projector: new PartyRegistryProjector(store, store, audit),
  };
}

describe('Projector PartyRegistry → bảng [P]', () => {
  it('PartyRegistered: kích hoạt ví PENDING và ghi chain_party_id', async () => {
    const { store, writer, userId, partyId, chainPartyId, projector } = await setup();
    const pending = store.seedWallet(userId, NEW, 'PENDING');

    await projector.project(
      chainEvent('PartyRegistered', { partyId: chainPartyId, kind: 1, wallet: NEW }),
      scope,
    );

    expect(store.parties.get(partyId)?.chainPartyId).toBe(chainPartyId);
    expect(store.wallets.get(pending.id)).toMatchObject({
      status: 'ACTIVE',
      activatedAt: blockTimestamp,
      linkTxHash: `0x${'bb'.repeat(32)}`,
    });
    expect(writer.entries[0]).toMatchObject({ action: 'WALLET_ACTIVATED', actorUserId: userId });
  });

  it('WalletRotated: ví cũ ROTATED có revoked_at, ví mới ACTIVE', async () => {
    const { store, userId, chainPartyId, projector } = await setup();
    const old = store.seedWallet(userId, OLD, 'ACTIVE');

    await projector.project(
      chainEvent('WalletRotated', { partyId: chainPartyId, previousWallet: OLD, newWallet: NEW }),
      scope,
    );

    expect(store.wallets.get(old.id)).toMatchObject({
      status: 'ROTATED',
      revokedAt: blockTimestamp,
    });
    expect(await store.findByAddress(NEW)).toMatchObject({ status: 'ACTIVE' });
  });

  it('bỏ qua partyId không do hệ thống cấp và Party tổ chức (thuộc M4)', async () => {
    const { store, chainPartyId, projector, writer } = await setup();

    await projector.project(
      chainEvent('PartyRegistered', { partyId: `0x${'ff'.repeat(32)}`, kind: 1, wallet: NEW }),
      scope,
    );
    await projector.project(
      chainEvent('PartyRegistered', { partyId: chainPartyId, kind: 2, wallet: NEW }),
      scope,
    );

    expect(store.wallets.size).toBe(0);
    expect(writer.entries).toHaveLength(0);
  });
});

async function expirySetup() {
  const context = await setup();
  const reader = new FakePartyRegistryReader();
  const tracker = new FakeTransactionTracker();
  const clock = new TestClock(new Date('2026-10-28T09:00:00Z'));
  const expire = new ExpireWalletLinks(
    context.store,
    reader,
    new Eip712WalletLinkAuthorizer(createTestConfig()),
    {
      siweDomain: 'localhost:3000',
      siweUri: 'http://localhost:3000',
      chainId: 31337,
      authorizationTtlSeconds: 900,
    },
    clock,
    tracker,
  );
  return { ...context, reader, tracker, expire };
}

describe('Scheduler dọn yêu cầu liên kết ví quá hạn', () => {
  it('xoá yêu cầu quá hạn chưa có giao dịch và chưa lên chain', async () => {
    const { store, userId, expire } = await expirySetup();
    const stale = store.seedWallet(userId, NEW, 'PENDING');

    expect(await expire.runOnce()).toBe(1);
    expect(store.wallets.has(stale.id)).toBe(false);
  });

  it('giữ yêu cầu có giao dịch đang chờ chốt hoặc ví đã lên chain', async () => {
    const { store, userId, reader, tracker, expire } = await expirySetup();
    const inFlight = store.seedWallet(userId, NEW, 'PENDING');
    const txHash = `0x${'cc'.repeat(32)}`;
    await store.attachLinkTransaction(inFlight.id, txHash);
    tracker.statuses.set(txHash, 'SUBMITTED');

    expect(await expire.runOnce()).toBe(0);

    await store.deletePending(inFlight.id);
    store.seedWallet(userId, OLD, 'PENDING');
    reader.usedWallets.add(OLD);
    expect(await expire.runOnce()).toBe(0);
  });

  it('xoá yêu cầu có giao dịch đã bị revert', async () => {
    const { store, userId, tracker, expire } = await expirySetup();
    const reverted = store.seedWallet(userId, NEW, 'PENDING');
    const txHash = `0x${'dd'.repeat(32)}`;
    await store.attachLinkTransaction(reverted.id, txHash);
    tracker.statuses.set(txHash, 'REVERTED');

    expect(await expire.runOnce()).toBe(1);
  });
});
