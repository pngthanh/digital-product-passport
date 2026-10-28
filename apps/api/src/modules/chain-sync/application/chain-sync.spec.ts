import {
  TransactionScope,
  type UnitOfWork,
} from '../../../common/persistence/transaction-scope.js';
import { TestClock } from '../../../../test/support/test-config.js';
import type { ChainEvent } from '../domain/chain-event.js';
import {
  ContractNotConfiguredError,
  TransactionMismatchError,
  TransactionNotFoundError,
} from '../domain/chain-sync.errors.js';
import { TX_DROP_TIMEOUT_MS, type TrackedTxStatus } from '../domain/transaction-confirmation.js';
import type {
  ChainBlock,
  ChainReader,
  ChainReceipt,
  ChainTransactionInfo,
} from './chain-reader.port.js';
import type {
  AwaitingTransaction,
  ChainTransactionRepository,
  FinalTransactionResult,
  SubmittedTransaction,
} from './chain-transaction.repository.js';
import { ConfirmTransactions } from './confirm-transactions.use-case.js';
import type { ContractCatalog, DecodedLog } from './contract-catalog.port.js';
import { EventProjectorRegistry } from './event-projector.js';
import type { EventStore } from './event-store.port.js';
import { TransactionTracker } from './transaction-tracker.service.js';

const REGISTRY = '0x5fbdb2315678afecb367f032d93f642f64180aa3';
const USER_WALLET = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
const TX_HASH = `0x${'ab'.repeat(32)}`;
const BLOCK_HASH = `0x${'cd'.repeat(32)}`;

class FakeChain implements ChainReader {
  readonly chainId = 31337;
  transactions = new Map<string, ChainTransactionInfo>();
  receipts = new Map<string, ChainReceipt>();
  blocks = new Map<bigint, ChainBlock>();
  finalized: bigint | null = 100n;

  async getTransaction(txHash: string) {
    return this.transactions.get(txHash) ?? null;
  }

  async getReceipt(txHash: string) {
    return this.receipts.get(txHash) ?? null;
  }

  async getFinalizedBlockNumber() {
    return this.finalized;
  }

  async getBlock(blockNumber: bigint) {
    return this.blocks.get(blockNumber) ?? null;
  }
}

/** Catalog giả: calldata bắt đầu bằng tên hàm, log có topic[0] là tên event. */
class FakeCatalog implements ContractCatalog {
  addressOf(contractName: string) {
    return contractName === 'PartyRegistry' ? REGISTRY : null;
  }

  decodeMethod(_contractName: string, data: string) {
    return data.startsWith('registerUser') ? 'registerUser' : null;
  }

  decodeLog(log: { address: string; topics: readonly string[] }): DecodedLog | null {
    return log.address === REGISTRY
      ? {
          contractName: 'PartyRegistry',
          contractAddress: REGISTRY,
          eventName: log.topics[0] ?? '',
          args: { wallet: USER_WALLET },
          correlationKey: null,
        }
      : null;
  }
}

class InMemoryTransactions implements ChainTransactionRepository {
  rows = new Map<string, SubmittedTransaction & { id: string; status: TrackedTxStatus }>();
  finals: FinalTransactionResult[] = [];

  async statusOf(txHash: string) {
    return this.rows.get(txHash)?.status ?? null;
  }

  async insertSubmitted(transaction: SubmittedTransaction) {
    this.rows.set(transaction.txHash, {
      ...transaction,
      id: `tx-${this.rows.size}`,
      status: 'SUBMITTED',
    });
  }

  async listAwaiting(): Promise<AwaitingTransaction[]> {
    return [...this.rows.values()]
      .filter((row) => row.status === 'SUBMITTED')
      .map((row) => ({ id: row.id, txHash: row.txHash, submittedAt: row.submittedAt }));
  }

  async markFinal(id: string, result: FinalTransactionResult) {
    this.finals.push(result);
    this.update(id, result.status);
  }

  async markDropped(id: string) {
    this.update(id, 'FAILED');
  }

  private update(id: string, status: TrackedTxStatus) {
    const row = [...this.rows.values()].find((candidate) => candidate.id === id);
    if (row) {
      row.status = status;
    }
  }
}

class InMemoryEvents implements EventStore {
  readonly keys = new Set<string>();

  async recordFinalized(event: ChainEvent) {
    const key = `${event.chainId}:${event.txHash}:${event.logIndex}`;
    const isNew = !this.keys.has(key);
    this.keys.add(key);
    return isNew;
  }
}

const passthroughUnitOfWork: UnitOfWork = {
  run: (work) => work(new TransactionScope({})),
};

class InstantTracker extends TransactionTracker {
  protected override readonly sleep = async () => {};
}

function userTransaction(overrides: Partial<ChainTransactionInfo> = {}): ChainTransactionInfo {
  return {
    hash: TX_HASH,
    from: USER_WALLET,
    to: REGISTRY,
    data: 'registerUser(...)',
    nonce: 7,
    gasLimit: 120_000n,
    maxFeePerGas: 102_000_000_000n,
    maxPriorityFeePerGas: 2_000_000_000n,
    value: 0n,
    ...overrides,
  };
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
