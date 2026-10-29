import { TestClock } from '../../../../test/support/test-config.js';
import {
  fakeHash,
  FakeCatalog,
  FakeChain,
  InMemoryCheckpoints,
  InMemoryEvents,
  InMemoryTransactions,
  passthroughUnitOfWork,
  REGISTRY,
  USER_WALLET,
} from '../../../../test/support/chain-sync-fakes.js';
import type { ChainEvent } from '../domain/chain-event.js';
import { ConfirmTransactions } from './confirm-transactions.use-case.js';
import { EventProjectorRegistry } from './event-projector.js';
import { IndexChainEvents, type IndexerSettings } from './index-chain-events.use-case.js';

const SETTINGS: IndexerSettings = { blockRange: 100, maxRangesPerRun: 10, pollIntervalMs: 1000 };

function setup(settings: Partial<IndexerSettings> = {}) {
  const chain = new FakeChain();
  const catalog = new FakeCatalog();
  const checkpoints = new InMemoryCheckpoints();
  const events = new InMemoryEvents();
  const projectors = new EventProjectorRegistry();
  const projected: ChainEvent[] = [];
  projectors.register({
    contractName: 'PartyRegistry',
    eventNames: ['PartyRegistered', 'WalletRotated'],
    project: async (event) => {
      projected.push(event);
    },
  });
  const indexer = new IndexChainEvents(
    chain,
    catalog,
    checkpoints,
    events,
    passthroughUnitOfWork,
    { ...SETTINGS, ...settings },
    projectors,
  );
  return { chain, catalog, checkpoints, events, projectors, projected, indexer };
}

describe('IndexChainEvents (Worker)', () => {
  it('quét từ block deploy: event đã finalized được ghi FINALIZED và chiếu đúng một lần', async () => {
    const { chain, checkpoints, events, projected, indexer } = setup();
    chain.emit({ event: 'PartyRegistered', blockNumber: 1n, txHash: fakeHash('a1') });
    chain.emit({ event: 'WalletRotated', blockNumber: 60n, txHash: fakeHash('a2'), logIndex: 4 });

    expect(await indexer.runOnce()).toMatchObject({ finalized: 2, observed: 0, orphaned: 0 });
    expect(await indexer.runOnce()).toMatchObject({ finalized: 0 });

    expect(projected.map((event) => event.eventName)).toEqual(['PartyRegistered', 'WalletRotated']);
    expect(projected[1]).toMatchObject({
      chainId: 31337,
      contractAddress: REGISTRY,
      blockNumber: 60n,
      blockHash: fakeHash('b60'),
      logIndex: 4,
      actorAddress: USER_WALLET,
    });
    expect(events.statusOf(fakeHash('a2'), 4)).toBe('FINALIZED');
    expect(checkpoints.only).toMatchObject({
      contractAddress: REGISTRY,
      lastFinalizedBlock: 100n,
      lastObservedBlock: 100n,
      lastFinalizedBlockHash: fakeHash('b100'),
    });
  });

  it('chưa khai báo block deploy thì bắt đầu từ block finalized hiện tại', async () => {
    const { chain, catalog, checkpoints, projected, indexer } = setup();
    catalog.startBlock = null;
    chain.emit({ event: 'PartyRegistered', blockNumber: 50n, txHash: fakeHash('a1') });

    await indexer.runOnce();

    expect(projected).toHaveLength(0);
    expect(checkpoint(checkpoints).lastFinalizedBlock).toBe(100n);
  });

  it('block chưa finalized: ghi PENDING, chỉ chiếu khi block đã finalized', async () => {
    const { chain, events, projected, indexer } = setup();
    chain.head = 103n;
    chain.emit({ event: 'PartyRegistered', blockNumber: 102n, txHash: fakeHash('a1') });

    expect(await indexer.runOnce()).toMatchObject({ finalized: 0, observed: 1 });
    expect(events.statusOf(fakeHash('a1'))).toBe('PENDING');
    expect(projected).toHaveLength(0);

    chain.finalized = 103n;
    expect(await indexer.runOnce()).toMatchObject({ finalized: 1, orphaned: 0 });
    expect(events.statusOf(fakeHash('a1'))).toBe('FINALIZED');
    expect(projected).toHaveLength(1);
  });

  it('reorg: event PENDING ở block bị thay thành ORPHANED, giao dịch vào lại block khác thì chốt lại', async () => {
    const { chain, events, projected, indexer } = setup();
    chain.head = 105n;
    chain.emit({ event: 'PartyRegistered', blockNumber: 103n, txHash: fakeHash('a1') });
    await indexer.runOnce();

    // Block 103 bị thay, cùng giao dịch được đưa vào block 105.
    chain.fork(103n);
    chain.emit({ event: 'PartyRegistered', blockNumber: 105n, txHash: fakeHash('a1') });
    chain.finalized = 104n;
    expect(await indexer.runOnce()).toMatchObject({ finalized: 0, orphaned: 1 });
    expect(events.statusOf(fakeHash('a1'))).toBe('ORPHANED');

    chain.finalized = 105n;
    expect(await indexer.runOnce()).toMatchObject({ finalized: 1 });
    expect(events.statusOf(fakeHash('a1'))).toBe('FINALIZED');
    expect(projected.map((event) => event.blockNumber)).toEqual([105n]);
  });

  it('RPC giới hạn số block mỗi lần: chia đôi đoạn rồi quét tiếp, không bỏ sót log', async () => {
    const { chain, checkpoints, projected, indexer } = setup();
    chain.maxLogRange = 30;
    chain.emit({ event: 'PartyRegistered', blockNumber: 99n, txHash: fakeHash('a1') });

    await indexer.runOnce();

    expect(projected).toHaveLength(1);
    expect(checkpoint(checkpoints).lastFinalizedBlock).toBe(100n);
    expect(chain.getLogsCalls.every((call) => call.toBlock - call.fromBlock < 30n)).toBe(true);
  });

  it('bắt kịp dần: mỗi vòng quét tối đa maxRangesPerRun đoạn, chưa bắt kịp thì chưa quét phần PENDING', async () => {
    const { chain, checkpoints, events, indexer } = setup({ blockRange: 10, maxRangesPerRun: 2 });
    chain.head = 102n;
    chain.emit({ event: 'PartyRegistered', blockNumber: 101n, txHash: fakeHash('a1') });

    await indexer.runOnce();

    expect(checkpoint(checkpoints).lastFinalizedBlock).toBe(20n);
    expect(events.statusOf(fakeHash('a1'))).toBeUndefined();
  });

  it('RPC báo block finalized thấp hơn mốc đã quét: chờ, không ghi gì', async () => {
    const { chain, checkpoints, indexer } = setup();
    await indexer.runOnce();
    chain.finalized = 50n;

    expect((await indexer.runOnce()).behind).toEqual(['PartyRegistry']);
    expect(checkpoint(checkpoints).lastFinalizedBlock).toBe(100n);
  });

  it('dùng chung blockchain_events với luồng chốt giao dịch: event chỉ được chiếu một lần', async () => {
    const { chain, catalog, events, projectors, projected, indexer } = setup();
    const txHash = fakeHash('a1');
    chain.emit({ event: 'PartyRegistered', blockNumber: 99n, txHash });
    chain.receipts.set(txHash, {
      succeeded: true,
      blockNumber: 99n,
      blockHash: fakeHash('b99'),
      transactionIndex: 0,
      from: USER_WALLET,
      gasUsed: 95_000n,
      effectiveGasPrice: 100_000_000_000n,
      logs: chain.logs,
    });
    const transactions = new InMemoryTransactions();
    await transactions.insertSubmitted({
      txHash,
      chainId: 31337,
      contractName: 'PartyRegistry',
      method: 'registerUser',
      fromAddress: USER_WALLET,
      toAddress: REGISTRY,
      nonce: 1,
      gasLimit: 120_000n,
      maxFeePerGas: null,
      maxPriorityFeePerGas: null,
      valueWei: 0n,
      initiatedByUserId: 'user-1',
      submittedAt: new Date(),
    });
    const clock = new TestClock();
    const confirm = new ConfirmTransactions(
      chain,
      catalog,
      transactions,
      events,
      passthroughUnitOfWork,
      clock,
      projectors,
    );

    expect((await confirm.runOnce()).finalized).toBe(1);
    expect((await indexer.runOnce()).finalized).toBe(0);
    expect(projected).toHaveLength(1);
  });
});

function checkpoint(checkpoints: InMemoryCheckpoints) {
  const saved = checkpoints.only;
  if (!saved) {
    throw new Error('Chưa có checkpoint');
  }
  return saved;
}
