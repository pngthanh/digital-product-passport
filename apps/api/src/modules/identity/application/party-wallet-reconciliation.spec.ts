import { partyIdFromUuid } from '@dpp/shared';
import {
  fakeHash,
  FakeCatalog,
  FakeChain,
  InMemoryCheckpoints,
  InMemoryEvents,
  REGISTRY,
} from '../../../../test/support/chain-sync-fakes.js';
import {
  FakePartyRegistryReader,
  InMemoryIdentityStore,
} from '../../../../test/support/identity-fakes.js';
import { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import { AnomalyAlerts } from '../../audit/application/anomaly-alerts.service.js';
import type { NewAnomalyAlert } from '../../audit/domain/anomaly-alert.js';
import { IndexedChainState } from '../../chain-sync/application/indexed-chain-state.query.js';
import { ReconcilePartyWallets } from './reconcile-party-wallets.use-case.js';

const WALLET = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const scope = new TransactionScope({});

/** Ghi như PrismaAnomalyAlertWriter: không tạo thêm khi đã có cảnh báo OPEN cùng luật và Party. */
class InMemoryAlerts {
  readonly open: NewAnomalyAlert[] = [];

  async raiseIfNew(alert: NewAnomalyAlert): Promise<boolean> {
    if (this.open.some((row) => row.ruleCode === alert.ruleCode && row.partyId === alert.partyId)) {
      return false;
    }
    this.open.push(alert);
    return true;
  }
}

async function setup() {
  const store = new InMemoryIdentityStore();
  const registry = new FakePartyRegistryReader();
  const checkpoints = new InMemoryCheckpoints();
  const events = new InMemoryEvents();
  const alertRows = new InMemoryAlerts();
  const chainState = new IndexedChainState(new FakeChain(), new FakeCatalog(), checkpoints, events);
  const { partyId } = await store.createWithParty({
    email: 'an@example.com',
    passwordHash: 'x',
    fullName: 'An',
  });
  const chainPartyId = partyIdFromUuid(partyId);
  await store.applyRegistration(
    { partyId, chainPartyId, address: WALLET, txHash: fakeHash('a1'), activatedAt: new Date() },
    scope,
  );
  return {
    registry,
    checkpoints,
    events,
    alertRows,
    partyId,
    chainPartyId,
    reconcile: new ReconcilePartyWallets(store, registry, chainState, new AnomalyAlerts(alertRows)),
  };
}

async function indexedUpTo(checkpoints: InMemoryCheckpoints, block: bigint) {
  await checkpoints.save({
    chainId: 31337,
    contractAddress: REGISTRY,
    lastObservedBlock: block,
    lastFinalizedBlock: block,
    lastFinalizedBlockHash: fakeHash(`b${block}`),
  });
}

describe('Đối soát ví PartyRegistry ↔ CSDL (Worker)', () => {
  it('Indexer chưa quét PartyRegistry thì chưa đối soát', async () => {
    const { registry, reconcile } = await setup();

    expect(await reconcile.runOnce()).toMatchObject({ atBlock: null, checked: 0 });
    expect(registry.walletOfBlocks).toHaveLength(0);
  });

  it('ví khớp: đọc walletOf đúng tại block Indexer đã chốt, không cảnh báo', async () => {
    const { registry, checkpoints, alertRows, chainPartyId, reconcile } = await setup();
    await indexedUpTo(checkpoints, 120n);
    registry.walletByParty.set(chainPartyId, WALLET);

    expect(await reconcile.runOnce()).toMatchObject({ atBlock: 120n, checked: 1, mismatched: 0 });
    expect(registry.walletOfBlocks).toEqual([120n]);
    expect(alertRows.open).toHaveLength(0);
  });

  it('ví lệch: tạo cảnh báo HIGH một lần, lượt sau không tạo trùng', async () => {
    const { registry, checkpoints, alertRows, partyId, chainPartyId, reconcile } = await setup();
    await indexedUpTo(checkpoints, 120n);
    registry.walletByParty.set(chainPartyId, OTHER);

    expect(await reconcile.runOnce()).toMatchObject({ mismatched: 1, raised: 1 });
    expect(await reconcile.runOnce()).toMatchObject({ mismatched: 1, raised: 0 });
    expect(alertRows.open).toEqual([
      {
        ruleCode: 'PARTY_WALLET_MISMATCH',
        severity: 'HIGH',
        partyId,
        details: {
          chainPartyId,
          chainWallet: OTHER,
          databaseWallet: WALLET,
          checkedAtBlock: '120',
        },
      },
    ]);
  });

  it('Party có event sau mốc (đang đổi ví) thì để lượt sau', async () => {
    const { registry, checkpoints, events, alertRows, chainPartyId, reconcile } = await setup();
    await indexedUpTo(checkpoints, 120n);
    registry.walletByParty.set(chainPartyId, OTHER);
    await events.recordObserved({
      chainId: 31337,
      contractName: 'PartyRegistry',
      contractAddress: REGISTRY,
      eventName: 'WalletRotated',
      args: {},
      blockNumber: 121n,
      blockHash: fakeHash('b121'),
      blockTimestamp: new Date(),
      txHash: fakeHash('a2'),
      txIndex: 0,
      logIndex: 0,
      actorAddress: OTHER,
      correlationKey: chainPartyId,
    });

    expect(await reconcile.runOnce()).toMatchObject({ checked: 0, skipped: 1 });
    expect(alertRows.open).toHaveLength(0);
  });
});
