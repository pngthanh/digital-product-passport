import { TestClock } from '../../../../test/support/test-config.js';
import {
  FakeCatalog,
  FakeChain,
  InMemoryEvents,
  InMemoryTransactions,
  passthroughUnitOfWork,
  REGISTRY,
  USER_WALLET,
  userTransaction as baseTransaction,
} from '../../../../test/support/chain-sync-fakes.js';
import type { ChainEvent } from '../domain/chain-event.js';
import {
  ContractNotConfiguredError,
  TransactionMismatchError,
  TransactionNotFoundError,
} from '../domain/chain-sync.errors.js';
import { TX_DROP_TIMEOUT_MS } from '../domain/transaction-confirmation.js';
import type { ChainReceipt, ChainTransactionInfo } from './chain-reader.port.js';
import { ConfirmTransactions } from './confirm-transactions.use-case.js';
import { EventProjectorRegistry } from './event-projector.js';
import { TransactionTracker } from './transaction-tracker.service.js';

const TX_HASH = `0x${'ab'.repeat(32)}`;
const BLOCK_HASH = `0x${'cd'.repeat(32)}`;

class InstantTracker extends TransactionTracker {
  protected override readonly sleep = async () => {};
}

function userTransaction(overrides: Partial<ChainTransactionInfo> = {}): ChainTransactionInfo {
  return baseTransaction({ hash: TX_HASH, ...overrides });
}

function setup() {
  const chain = new FakeChain();
  const repository = new InMemoryTransactions();
  const events = new InMemoryEvents();
  const clock = new TestClock();
  const projectors = new EventProjectorRegistry();
  const projected: ChainEvent[] = [];
  projectors.register({
    contractName: 'PartyRegistry',
    eventNames: ['PartyRegistered'],
    project: async (event) => {
      projected.push(event);
    },
  });
  const catalog = new FakeCatalog();
  return {
    chain,
    repository,
    clock,
    projected,
    tracker: new InstantTracker(chain, catalog, repository, clock),
    confirm: new ConfirmTransactions(
      chain,
      catalog,
      repository,
      events,
      passthroughUnitOfWork,
      clock,
      projectors,
    ),
  };
}

const trackInput = {
  txHash: TX_HASH.toUpperCase().replace('0X', '0x'),
  contractName: 'PartyRegistry',
  expectedFrom: USER_WALLET,
  expectedMethods: ['registerUser'],
  initiatedByUserId: 'user-1',
};

describe('TransactionTracker', () => {
  it('ghi chain_transactions SUBMITTED kèm nonce, gas limit, phí; gọi lại không tạo trùng', async () => {
    const { chain, repository, tracker } = setup();
    chain.transactions.set(TX_HASH, userTransaction());

    expect(await tracker.track(trackInput)).toBe('SUBMITTED');
    expect(await tracker.track(trackInput)).toBe('SUBMITTED');

    expect(repository.rows.size).toBe(1);
    expect(repository.rows.get(TX_HASH)).toMatchObject({
      method: 'registerUser',
      nonce: 7,
      gasLimit: 120_000n,
      fromAddress: USER_WALLET,
      toAddress: REGISTRY,
    });
  });

  it('từ chối giao dịch gửi tới contract khác, từ ví khác hoặc gọi hàm khác', async () => {
    const { chain, tracker } = setup();

    chain.transactions.set(TX_HASH, userTransaction({ to: USER_WALLET }));
    await expect(tracker.track(trackInput)).rejects.toBeInstanceOf(TransactionMismatchError);

    chain.transactions.set(TX_HASH, userTransaction({ from: REGISTRY }));
    await expect(tracker.track(trackInput)).rejects.toBeInstanceOf(TransactionMismatchError);

    chain.transactions.set(TX_HASH, userTransaction({ data: '0xdeadbeef' }));
    await expect(tracker.track(trackInput)).rejects.toBeInstanceOf(TransactionMismatchError);
  });

  it('báo không tìm thấy sau khi đã thử lại', async () => {
    const { tracker } = setup();

    await expect(tracker.track(trackInput)).rejects.toBeInstanceOf(TransactionNotFoundError);
  });

  it('báo chưa cấu hình khi không biết địa chỉ contract', async () => {
    const { tracker } = setup();

    await expect(
      tracker.track({ ...trackInput, contractName: 'ProductPassport' }),
    ).rejects.toBeInstanceOf(ContractNotConfiguredError);
  });
});

function receipt(overrides: Partial<ChainReceipt> = {}): ChainReceipt {
  return {
    succeeded: true,
    blockNumber: 99n,
    blockHash: BLOCK_HASH,
    transactionIndex: 0,
    from: USER_WALLET,
    gasUsed: 95_000n,
    effectiveGasPrice: 100_000_000_000n,
    logs: [{ address: REGISTRY, topics: ['PartyRegistered'], data: '0x', logIndex: 3 }],
    ...overrides,
  };
}

async function submitted() {
  const context = setup();
  context.chain.transactions.set(TX_HASH, userTransaction());
  await context.tracker.track(trackInput);
  return context;
}

describe('ConfirmTransactions (Worker)', () => {
  it('chờ khi block chứa giao dịch chưa finalized', async () => {
    const { chain, confirm, projected } = await submitted();
    chain.receipts.set(TX_HASH, receipt({ blockNumber: 101n }));

    expect(await confirm.runOnce()).toEqual({ finalized: 0, dropped: 0, waiting: 1 });
    expect(projected).toHaveLength(0);
  });

  it('chốt CONFIRMED, lưu gas thực tế và chiếu event đúng một lần', async () => {
    const { chain, repository, confirm, projected } = await submitted();
    chain.receipts.set(TX_HASH, receipt());
    chain.blocks.set(99n, { hash: BLOCK_HASH, timestamp: new Date('2026-10-28T08:00:30Z') });

    expect(await confirm.runOnce()).toEqual({ finalized: 1, dropped: 0, waiting: 0 });
    expect(await confirm.runOnce()).toEqual({ finalized: 0, dropped: 0, waiting: 0 });

    expect(repository.finals[0]).toMatchObject({
      status: 'CONFIRMED',
      blockNumber: 99n,
      gasUsed: 95_000n,
    });
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({
      eventName: 'PartyRegistered',
      blockHash: BLOCK_HASH,
      txHash: TX_HASH,
      logIndex: 3,
      actorAddress: USER_WALLET,
    });
  });

  it('giao dịch revert được chốt REVERTED, không chiếu event', async () => {
    const { chain, repository, confirm, projected } = await submitted();
    chain.receipts.set(TX_HASH, receipt({ succeeded: false, logs: [] }));
    chain.blocks.set(99n, { hash: BLOCK_HASH, timestamp: new Date() });

    await confirm.runOnce();

    expect(repository.finals[0]?.status).toBe('REVERTED');
    expect(projected).toHaveLength(0);
  });

  it('đợi đọc lại khi hash block lệch với receipt', async () => {
    const { chain, confirm } = await submitted();
    chain.receipts.set(TX_HASH, receipt());
    chain.blocks.set(99n, { hash: `0x${'ee'.repeat(32)}`, timestamp: new Date() });

    expect((await confirm.runOnce()).waiting).toBe(1);
  });

  it('đánh dấu FAILED khi quá hạn mà giao dịch không vào block', async () => {
    const { clock, repository, confirm } = await submitted();
    clock.advance(TX_DROP_TIMEOUT_MS + 1_000);

    expect((await confirm.runOnce()).dropped).toBe(1);
    expect(await repository.statusOf(TX_HASH)).toBe('FAILED');
  });
});
