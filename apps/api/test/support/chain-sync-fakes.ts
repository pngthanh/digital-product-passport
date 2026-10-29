import {
  TransactionScope,
  type UnitOfWork,
} from '../../src/common/persistence/transaction-scope.js';
import {
  type ChainBlock,
  type ChainLogEntry,
  type ChainReader,
  type ChainReceipt,
  type ChainTransactionInfo,
  type LogFilter,
  LogRangeTooLargeError,
} from '../../src/modules/chain-sync/application/chain-reader.port.js';
import type {
  AwaitingTransaction,
  ChainTransactionRepository,
  FinalTransactionResult,
  SubmittedTransaction,
} from '../../src/modules/chain-sync/application/chain-transaction.repository.js';
import type {
  ContractCatalog,
  DecodedLog,
} from '../../src/modules/chain-sync/application/contract-catalog.port.js';
import type { EventStore } from '../../src/modules/chain-sync/application/event-store.port.js';
import type {
  IndexerCheckpointRepository,
  StoredCheckpoint,
} from '../../src/modules/chain-sync/application/indexer-checkpoint.repository.js';
import {
  ChainEventHistory,
  type ChainEventReader,
} from '../../src/modules/chain-sync/application/chain-event-history.query.js';
import type { BlockRange } from '../../src/modules/chain-sync/domain/block-range.js';
import type {
  ChainEvent,
  RecordedChainEvent,
} from '../../src/modules/chain-sync/domain/chain-event.js';
import type {
  IndexedContract,
  IndexerCheckpoint,
} from '../../src/modules/chain-sync/domain/indexer-checkpoint.js';
import type { TrackedTxStatus } from '../../src/modules/chain-sync/domain/transaction-confirmation.js';

export const REGISTRY = '0x5fbdb2315678afecb367f032d93f642f64180aa3';
export const USER_WALLET = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';

/** Hash giả 32 byte, phân biệt theo nhãn. */
export function fakeHash(label: string | bigint): string {
  return `0x${String(label).padStart(64, '0')}`;
}

/** RPC giả: block có hash theo số (thay `fork` để mô phỏng block bị thay sau reorg). */
export class FakeChain implements ChainReader {
  readonly chainId = 31337;
  transactions = new Map<string, ChainTransactionInfo>();
  receipts = new Map<string, ChainReceipt>();
  blocks = new Map<bigint, ChainBlock>();
  logs: ChainLogEntry[] = [];
  head = 100n;
  finalized: bigint | null = 100n;
  /** Số block tối đa mỗi lần eth_getLogs; `null` là không giới hạn. */
  maxLogRange: number | null = null;
  readonly getLogsCalls: LogFilter[] = [];

  async getTransaction(txHash: string) {
    return this.transactions.get(txHash) ?? null;
  }

  async getReceipt(txHash: string) {
    return this.receipts.get(txHash) ?? null;
  }

  async getLatestBlockNumber() {
    return this.head;
  }

  async getFinalizedBlockNumber() {
    return this.finalized;
  }

  async getBlock(blockNumber: bigint) {
    return blockNumber > this.head ? null : this.blockAt(blockNumber);
  }

  async getLogs(filter: LogFilter) {
    const blocks = Number(filter.toBlock - filter.fromBlock + 1n);
    if (this.maxLogRange !== null && blocks > this.maxLogRange) {
      throw new LogRangeTooLargeError(blocks);
    }
    this.getLogsCalls.push(filter);
    return this.logs.filter(
      (log) =>
        log.address === filter.address &&
        log.blockNumber >= filter.fromBlock &&
        log.blockNumber <= filter.toBlock,
    );
  }

  /** Thêm log của một giao dịch do `from` gửi, hash block khớp `getBlock`. */
  emit(input: {
    event: string;
    blockNumber: bigint;
    txHash: string;
    logIndex?: number;
    from?: string;
  }): void {
    const block = this.blockAt(input.blockNumber);
    this.logs.push({
      address: REGISTRY,
      topics: [input.event],
      data: '0x',
      logIndex: input.logIndex ?? 0,
      blockNumber: input.blockNumber,
      blockHash: block.hash,
      txHash: input.txHash,
      txIndex: 0,
    });
    this.transactions.set(input.txHash, userTransaction({ hash: input.txHash, from: input.from }));
  }

  /** Reorg: block được thay bằng phiên bản khác, log cũ trong block biến mất. */
  fork(blockNumber: bigint): void {
    this.logs = this.logs.filter((log) => log.blockNumber !== blockNumber);
    this.blocks.set(blockNumber, {
      hash: fakeHash(`fb${blockNumber}`),
      timestamp: blockTime(blockNumber),
    });
  }

  private blockAt(blockNumber: bigint): ChainBlock {
    const block = this.blocks.get(blockNumber) ?? {
      hash: fakeHash(`b${blockNumber}`),
      timestamp: blockTime(blockNumber),
    };
    this.blocks.set(blockNumber, block);
    return block;
  }
}

function blockTime(blockNumber: bigint): Date {
  return new Date(Date.UTC(2026, 9, 28, 8) + Number(blockNumber) * 400);
}

export function userTransaction(
  overrides: Partial<Omit<ChainTransactionInfo, 'from'>> & { from?: string | undefined } = {},
): ChainTransactionInfo {
  const { from, ...rest } = overrides;
  return {
    hash: fakeHash('tx'),
    from: from ?? USER_WALLET,
    to: REGISTRY,
    data: 'registerUser(...)',
    nonce: 7,
    gasLimit: 120_000n,
    maxFeePerGas: 102_000_000_000n,
    maxPriorityFeePerGas: 2_000_000_000n,
    value: 0n,
    ...rest,
  };
}

/** Catalog giả: calldata bắt đầu bằng tên hàm, log có topic[0] là tên event. */
export class FakeCatalog implements ContractCatalog {
  startBlock: bigint | null = 1n;

  addressOf(contractName: string) {
    return contractName === 'PartyRegistry' ? REGISTRY : null;
  }

  indexedContracts(): IndexedContract[] {
    return [{ name: 'PartyRegistry', address: REGISTRY, startBlock: this.startBlock }];
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
          chainProductId: null,
        }
      : null;
  }
}

export class InMemoryTransactions implements ChainTransactionRepository {
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

export type StoredFinality = 'PENDING' | 'FINALIZED' | 'ORPHANED';

/** blockchain_events trong bộ nhớ, cùng ngữ nghĩa với PrismaEventStore. */
export class InMemoryEvents implements EventStore {
  readonly rows = new Map<string, { event: ChainEvent; status: StoredFinality }>();

  async finalize(event: ChainEvent) {
    const row = this.rows.get(keyOf(event));
    if (row?.status === 'FINALIZED') {
      return null;
    }
    this.rows.set(keyOf(event), { event, status: 'FINALIZED' });
    return `event-${keyOf(event)}`;
  }

  async recordObserved(event: ChainEvent) {
    if (this.rows.get(keyOf(event))?.status !== 'FINALIZED') {
      this.rows.set(keyOf(event), { event, status: 'PENDING' });
    }
  }

  async orphanPending(chainId: number, contractAddress: string, range: BlockRange) {
    let count = 0;
    for (const row of this.rows.values()) {
      const { event } = row;
      if (
        row.status === 'PENDING' &&
        event.chainId === chainId &&
        event.contractAddress === contractAddress &&
        event.blockNumber >= range.from &&
        event.blockNumber <= range.to
      ) {
        row.status = 'ORPHANED';
        count += 1;
      }
    }
    return count;
  }

  async correlationKeysAfter(chainId: number, contractAddress: string, block: bigint) {
    const keys = [...this.rows.values()].flatMap(({ event, status }) =>
      status !== 'ORPHANED' &&
      event.chainId === chainId &&
      event.contractAddress === contractAddress &&
      event.blockNumber > block &&
      event.correlationKey
        ? [event.correlationKey]
        : [],
    );
    return [...new Set(keys)];
  }

  statusOf(txHash: string, logIndex = 0): StoredFinality | undefined {
    return [...this.rows.values()].find(
      (row) => row.event.txHash === txHash && row.event.logIndex === logIndex,
    )?.status;
  }
}

function keyOf(event: ChainEvent): string {
  return `${event.chainId}:${event.txHash}:${event.logIndex}`;
}

export class InMemoryCheckpoints implements IndexerCheckpointRepository {
  readonly rows = new Map<string, StoredCheckpoint>();

  async find(chainId: number, contractAddress: string) {
    return this.rows.get(`${chainId}:${contractAddress}`) ?? null;
  }

  async save(checkpoint: IndexerCheckpoint) {
    this.rows.set(`${checkpoint.chainId}:${checkpoint.contractAddress}`, {
      ...checkpoint,
      updatedAt: new Date(),
    });
  }

  get only(): StoredCheckpoint | undefined {
    return [...this.rows.values()][0];
  }
}

export const passthroughUnitOfWork: UnitOfWork = {
  run: (work) => work(new TransactionScope({})),
};

/** blockchain_events (chỉ đọc) trong bộ nhớ: đọc lại các event mà test đưa vào. */
export class InMemoryChainEventReader implements ChainEventReader {
  readonly events: (ChainEvent & { chainProductId?: string | null })[] = [];

  async byCorrelation(chainId: number, contractAddress: string, correlationKey: string) {
    return this.events
      .filter(
        (event) =>
          event.chainId === chainId &&
          event.contractAddress === contractAddress &&
          event.correlationKey === correlationKey,
      )
      .map(toRecorded);
  }

  async byProduct(
    chainId: number,
    contractAddresses: readonly string[],
    chainProductIds: readonly string[],
  ) {
    return this.events
      .filter(
        (event) =>
          event.chainId === chainId &&
          contractAddresses.includes(event.contractAddress) &&
          !!event.chainProductId &&
          chainProductIds.includes(event.chainProductId),
      )
      .map(toRecorded);
  }
}

function toRecorded(event: ChainEvent): RecordedChainEvent {
  return {
    eventName: event.eventName,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    logIndex: event.logIndex,
    blockTimestamp: event.blockTimestamp,
    actorAddress: event.actorAddress,
    args: event.args,
  };
}

/** FakeCatalog có thêm các contract sản phẩm (ProductPassport, WarrantyManager) trong test. */
class HistoryCatalog extends FakeCatalog {
  constructor(private readonly extra: readonly string[]) {
    super();
  }

  override indexedContracts(): IndexedContract[] {
    return [
      ...super.indexedContracts(),
      ...this.extra.map((address) => ({ name: 'Product', address, startBlock: 1n })),
    ];
  }
}

/** ChainEventHistory thật trên dữ liệu trong bộ nhớ; `contracts` là địa chỉ contract sản phẩm đang dùng. */
export function inMemoryChainHistory(
  reader = new InMemoryChainEventReader(),
  contracts: readonly string[] = [],
): ChainEventHistory {
  return new ChainEventHistory(reader, new HistoryCatalog(contracts), new FakeChain());
}
