import { Inject, Injectable, Logger } from '@nestjs/common';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../common/persistence/transaction-scope.js';
import { type BlockRange, nextBlockRange } from '../domain/block-range.js';
import type { ChainEvent } from '../domain/chain-event.js';
import {
  advanceFinalized,
  advanceObserved,
  type IndexedContract,
  type IndexerCheckpoint,
  initialCheckpoint,
} from '../domain/indexer-checkpoint.js';
import {
  type ChainBlock,
  ChainDataUnavailableError,
  type ChainLogEntry,
  CHAIN_READER,
  type ChainReader,
  LogRangeTooLargeError,
} from './chain-reader.port.js';
import { CONTRACT_CATALOG, type ContractCatalog } from './contract-catalog.port.js';
import { EVENT_STORE, type EventStore } from './event-store.port.js';
import { EventProjectorRegistry } from './event-projector.js';
import {
  INDEXER_CHECKPOINT_REPOSITORY,
  type IndexerCheckpointRepository,
} from './indexer-checkpoint.repository.js';

export interface IndexerSettings {
  /** Số block tối đa mỗi lần gọi eth_getLogs. */
  readonly blockRange: number;
  /** Số đoạn gọi eth_getLogs song song trong một lượt; mỗi lượt chốt vào CSDL một lần. */
  readonly parallelRanges: number;
  /** Số đoạn tối đa mỗi vòng, để một vòng bắt kịp không chạy quá lâu. */
  readonly maxRangesPerRun: number;
  readonly pollIntervalMs: number;
}

export const INDEXER_SETTINGS = Symbol('INDEXER_SETTINGS');

export interface IndexingSummary {
  /** Event được chốt FINALIZED (và chiếu) lần đầu trong vòng này. */
  finalized: number;
  /** Event PENDING ghi từ block chưa finalized. */
  observed: number;
  orphaned: number;
  /** Contract có mốc cao hơn block finalized RPC báo (RPC chậm hoặc Hardhat node vừa khởi động lại). */
  behind: string[];
  failed: string[];
  /** Số block contract chậm nhất còn phải quét tới block finalized; 0 là đã bắt kịp. */
  remainingBlocks: bigint;
}

/** Contract đang quét cùng mốc hiện tại; mốc chỉ đổi sau khi CSDL đã ghi xong. */
interface TrackedContract {
  readonly contract: IndexedContract;
  checkpoint: IndexerCheckpoint;
}

/** Một lần gọi eth_getLogs: đoạn block và các contract còn cần quét đoạn đó. */
interface PlannedRange {
  readonly range: BlockRange;
  readonly members: readonly TrackedContract[];
}

/**
 * Worker: quét log các contract trong danh mục và ghi blockchain_events.
 * Mỗi lần gọi eth_getLogs lấy log của mọi contract còn cần đoạn đó; khi đang bắt kịp thì gọi song
 * song nhiều đoạn rồi chốt một lần, event được chiếu theo đúng thứ tự trên chain (block, logIndex).
 * Block chưa finalized ghi PENDING; khi block finalized thì quét lại đoạn đó làm chuẩn:
 * event còn trên chain thành FINALIZED và được chiếu, event không còn thành ORPHANED.
 */
@Injectable()
export class IndexChainEvents {
  private readonly logger = new Logger(IndexChainEvents.name);
  private blockRange: number;

  constructor(
    @Inject(CHAIN_READER) private readonly reader: ChainReader,
    @Inject(CONTRACT_CATALOG) private readonly catalog: ContractCatalog,
    @Inject(INDEXER_CHECKPOINT_REPOSITORY)
    private readonly checkpoints: IndexerCheckpointRepository,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(INDEXER_SETTINGS) private readonly settings: IndexerSettings,
    private readonly projectors: EventProjectorRegistry,
  ) {
    this.blockRange = settings.blockRange;
  }

  async runOnce(): Promise<IndexingSummary> {
    const summary: IndexingSummary = {
      finalized: 0,
      observed: 0,
      orphaned: 0,
      behind: [],
      failed: [],
      remainingBlocks: 0n,
    };
    const contracts = this.catalog.indexedContracts();
    if (contracts.length === 0) {
      return summary;
    }
    const [head, finalized] = await Promise.all([
      this.reader.getLatestBlockNumber(),
      this.reader.getFinalizedBlockNumber(),
    ]);
    if (finalized === null) {
      throw new Error('RPC không hỗ trợ block tag "finalized"');
    }

    const tracked: TrackedContract[] = [];
    for (const contract of contracts) {
      try {
        const checkpoint =
          (await this.checkpoints.find(this.reader.chainId, contract.address)) ??
          (await this.start(contract, finalized));
        if (finalized < checkpoint.lastFinalizedBlock) {
          summary.behind.push(contract.name);
        } else {
          tracked.push({ contract, checkpoint });
        }
      } catch (error) {
        summary.failed.push(contract.name);
        this.report(`Chưa tạo được mốc quét ${contract.name}`, error);
      }
    }

    await this.catchUp(tracked, finalized, summary);
    await this.observeTail(tracked, finalized, head, summary);

    const lowest = tracked.reduce<bigint | null>(
      (min, { checkpoint }) =>
        min === null || checkpoint.lastFinalizedBlock < min ? checkpoint.lastFinalizedBlock : min,
      null,
    );
    summary.remainingBlocks = lowest === null ? 0n : finalized - lowest;
    return summary;
  }

  /** Đoạn đã finalized: kết quả eth_getLogs lúc này là chuẩn, không còn thay đổi. */
  private async catchUp(
    tracked: readonly TrackedContract[],
    finalized: bigint,
    summary: IndexingSummary,
  ): Promise<void> {
    let ranges = 0;
    while (ranges < this.settings.maxRangesPerRun) {
      const count = Math.max(
        1,
        Math.min(this.settings.parallelRanges, this.settings.maxRangesPerRun - ranges),
      );
      const plan = this.plan(
        tracked,
        (member) => member.checkpoint.lastFinalizedBlock,
        finalized,
        count,
      );
      if (plan.length === 0) {
        return;
      }
      const to = lastBlockOf(plan);
      const members = membersOf(plan);
      try {
        const fetched = await this.fetch(plan, to);
        if (!fetched) {
          continue;
        }
        if (!fetched.anchor) {
          throw new ChainDataUnavailableError(`RPC chưa có block ${to}`);
        }
        await this.commitFinalized(
          members,
          fetched.logs,
          { number: to, hash: fetched.anchor.hash },
          summary,
        );
      } catch (error) {
        summary.failed.push(...members.map(({ contract }) => contract.name));
        this.report(
          `Không quét được log block ${plan[0]?.range.from}–${to} (${namesOf(members)})`,
          error,
        );
        return;
      }
      ranges += plan.length;
    }
  }

  /** Block chưa finalized: ghi PENDING để biết sớm, chưa chiếu sang bảng nghiệp vụ. */
  private async observeTail(
    tracked: readonly TrackedContract[],
    finalized: bigint,
    head: bigint,
    summary: IndexingSummary,
  ): Promise<void> {
    const ready = tracked.filter(({ checkpoint }) => checkpoint.lastFinalizedBlock >= finalized);
    const scannedOf = ({ checkpoint }: TrackedContract) =>
      checkpoint.lastObservedBlock > finalized ? checkpoint.lastObservedBlock : finalized;
    for (;;) {
      const plan = this.plan(ready, scannedOf, head, 1);
      if (plan.length === 0) {
        return;
      }
      const members = membersOf(plan);
      try {
        const fetched = await this.fetch(plan, null);
        if (!fetched) {
          continue;
        }
        const to = lastBlockOf(plan);
        const events = await this.toEvents(acceptedLogs(fetched.logs, members, scannedOf), false);
        const next = members.map((member) => advanceObserved(member.checkpoint, to));
        await this.unitOfWork.run(async (scope) => {
          for (const event of events) {
            await this.events.recordObserved(event, scope);
          }
          for (const checkpoint of next) {
            await this.checkpoints.save(checkpoint, scope);
          }
        });
        members.forEach((member, index) => {
          member.checkpoint = next[index] ?? member.checkpoint;
        });
        summary.observed += events.length;
      } catch (error) {
        summary.failed.push(...members.map(({ contract }) => contract.name));
        this.report(`Không quét được log block chưa finalized (${namesOf(members)})`, error);
      }
      return;
    }
  }

  /**
   * Chia phần còn thiếu thành tối đa `count` đoạn liên tiếp, bắt đầu từ contract chậm nhất. Mỗi đoạn
   * chỉ gọi cho contract có mốc thấp hơn cuối đoạn; contract đã quét xa hơn được ghép vào khi tới.
   */
  private plan(
    tracked: readonly TrackedContract[],
    scannedOf: (member: TrackedContract) => bigint,
    target: bigint,
    count: number,
  ): PlannedRange[] {
    const pending = tracked.filter((member) => scannedOf(member) < target);
    if (pending.length === 0) {
      return [];
    }
    let last = pending.reduce((min, member) => {
      const scanned = scannedOf(member);
      return scanned < min ? scanned : min;
    }, target);
    const plan: PlannedRange[] = [];
    while (plan.length < count) {
      const range = nextBlockRange(last, target, this.blockRange);
      if (!range) {
        break;
      }
      plan.push({ range, members: pending.filter((member) => scannedOf(member) < range.to) });
      last = range.to;
    }
    return plan;
  }

  /**
   * Gọi các đoạn song song (kèm block cuối làm mốc nếu cần). RPC giới hạn số block mỗi lần thì giảm
   * cỡ đoạn cho các lần sau và trả `null` để lập lại kế hoạch với đoạn nhỏ hơn.
   */
  private async fetch(
    plan: readonly PlannedRange[],
    anchorBlock: bigint | null,
  ): Promise<{ logs: ChainLogEntry[]; anchor: ChainBlock | null } | null> {
    try {
      const [anchor, ...logs] = await Promise.all([
        anchorBlock === null ? Promise.resolve(null) : this.reader.getBlock(anchorBlock),
        ...plan.map(({ range, members }) =>
          this.reader.getLogs({
            addresses: members.map(({ contract }) => contract.address),
            fromBlock: range.from,
            toBlock: range.to,
          }),
        ),
      ]);
      return { logs: logs.flat(), anchor };
    } catch (error) {
      if (!(error instanceof LogRangeTooLargeError) || error.blocks <= 1) {
        throw error;
      }
      this.blockRange = Math.max(1, Math.floor(error.blocks / 2));
      this.logger.warn(
        `RPC giới hạn eth_getLogs, giảm còn ${this.blockRange} block mỗi lần (đặt INDEXER_BLOCK_RANGE cho khớp)`,
      );
      return null;
    }
  }

  private async commitFinalized(
    members: readonly TrackedContract[],
    logs: readonly ChainLogEntry[],
    anchor: { number: bigint; hash: string },
    summary: IndexingSummary,
  ): Promise<void> {
    const before = (member: TrackedContract) => member.checkpoint.lastFinalizedBlock;
    const events = await this.toEvents(acceptedLogs(logs, members, before), true);
    const next = members.map((member) => advanceFinalized(member.checkpoint, anchor));
    await this.unitOfWork.run(async (scope) => {
      for (const event of events) {
        const eventId = await this.events.finalize(event, scope);
        if (eventId) {
          summary.finalized += 1;
          await this.projectors
            .find(event.contractName, event.eventName)
            ?.project({ ...event, eventId }, scope);
        }
      }
      for (const [index, member] of members.entries()) {
        summary.orphaned += await this.events.orphanPending(
          this.reader.chainId,
          member.contract.address,
          { from: before(member) + 1n, to: anchor.number },
          scope,
        );
        const checkpoint = next[index];
        if (checkpoint) {
          await this.checkpoints.save(checkpoint, scope);
        }
      }
    });
    members.forEach((member, index) => {
      member.checkpoint = next[index] ?? member.checkpoint;
    });
  }

  private async start(contract: IndexedContract, finalized: bigint): Promise<IndexerCheckpoint> {
    if (contract.startBlock === null) {
      this.logger.warn(
        `Chưa khai báo block deploy của ${contract.name}: chỉ quét từ block ${finalized + 1n}, event cũ hơn không được ghi`,
      );
    }
    // Block 0 (genesis) không có log nên mốc đầu tối thiểu là 0.
    const beforeStart =
      contract.startBlock === null
        ? finalized
        : contract.startBlock > 0n
          ? contract.startBlock - 1n
          : 0n;
    const anchorNumber = beforeStart < finalized ? beforeStart : finalized;
    const anchor = await this.reader.getBlock(anchorNumber);
    if (!anchor) {
      throw new ChainDataUnavailableError(`RPC không trả block ${anchorNumber}`);
    }
    const checkpoint = initialCheckpoint(this.reader.chainId, contract.address, {
      number: anchorNumber,
      hash: anchor.hash,
    });
    await this.checkpoints.save(checkpoint);
    return checkpoint;
  }

  private async toEvents(
    logs: readonly ChainLogEntry[],
    canonical: boolean,
  ): Promise<ChainEvent[]> {
    const blocks = new Map<bigint, ChainBlock>();
    const senders = new Map<string, string | null>();
    const ordered = logs.toSorted((a, b) =>
      a.blockNumber === b.blockNumber
        ? a.logIndex - b.logIndex
        : a.blockNumber < b.blockNumber
          ? -1
          : 1,
    );
    const events: ChainEvent[] = [];
    for (const log of ordered) {
      const decoded = this.catalog.decodeLog(log);
      if (!decoded) {
        continue;
      }
      const block = blocks.get(log.blockNumber) ?? (await this.reader.getBlock(log.blockNumber));
      if (!block) {
        throw new ChainDataUnavailableError(`RPC không trả block ${log.blockNumber}`);
      }
      blocks.set(log.blockNumber, block);
      if (canonical && block.hash !== log.blockHash) {
        throw new ChainDataUnavailableError(
          `Log và block ${log.blockNumber} lệch hash, đọc lại ở vòng sau`,
        );
      }
      if (!senders.has(log.txHash)) {
        senders.set(log.txHash, (await this.reader.getTransaction(log.txHash))?.from ?? null);
      }
      events.push({
        ...decoded,
        chainId: this.reader.chainId,
        blockNumber: log.blockNumber,
        blockHash: log.blockHash,
        blockTimestamp: block.timestamp,
        txHash: log.txHash,
        txIndex: log.txIndex,
        logIndex: log.logIndex,
        actorAddress: senders.get(log.txHash) ?? null,
      });
    }
    return events;
  }

  /** Lỗi RPC tạm thời chỉ ghi một dòng (vòng sau tự quét lại); lỗi khác ghi kèm stack để sửa. */
  private report(context: string, error: unknown): void {
    if (isTransientChainError(error)) {
      this.logger.warn(`${context}: ${rpcMessage(error)}. Vòng sau quét lại.`);
    } else {
      this.logger.error(context, error instanceof Error ? error.stack : String(error));
    }
  }
}

function lastBlockOf(plan: readonly PlannedRange[]): bigint {
  const last = plan.at(-1);
  if (!last) {
    throw new Error('Kế hoạch quét rỗng');
  }
  return last.range.to;
}

/** Contract có mặt trong ít nhất một đoạn của kế hoạch. */
function membersOf(plan: readonly PlannedRange[]): TrackedContract[] {
  return [...new Set(plan.flatMap(({ members }) => members))];
}

function namesOf(members: readonly TrackedContract[]): string {
  return members.map(({ contract }) => contract.name).join(', ');
}

/** Chỉ giữ log của contract trong kế hoạch, ở block sau mốc đã quét của contract đó. */
function acceptedLogs(
  logs: readonly ChainLogEntry[],
  members: readonly TrackedContract[],
  scannedOf: (member: TrackedContract) => bigint,
): ChainLogEntry[] {
  const byAddress = new Map(
    members.map((member) => [member.contract.address.toLowerCase(), member]),
  );
  return logs.filter((log) => {
    const member = byAddress.get(log.address.toLowerCase());
    return !!member && log.blockNumber > scannedOf(member);
  });
}

/** Lỗi phía RPC hoặc mạng (ethers và Node dùng mã chữ in hoa), không phải lỗi dữ liệu hay code. */
function isTransientChainError(error: unknown): boolean {
  if (error instanceof ChainDataUnavailableError || error instanceof LogRangeTooLargeError) {
    return true;
  }
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^[A-Z][A-Z_]+$/.test(error.code)
  );
}

/** ethers bọc lỗi JSON-RPC trong `error`; lấy thông điệp gốc của RPC cho gọn log. */
function rpcMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    if (
      'error' in error &&
      typeof error.error === 'object' &&
      error.error !== null &&
      'message' in error.error &&
      typeof error.error.message === 'string'
    ) {
      return error.error.message;
    }
    if ('shortMessage' in error && typeof error.shortMessage === 'string') {
      return error.shortMessage;
    }
  }
  return error instanceof Error ? error.message : String(error);
}
