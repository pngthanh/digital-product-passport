import { Inject, Injectable, Logger } from '@nestjs/common';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../common/persistence/transaction-scope.js';
import { type BlockRange, blockCount, nextBlockRange } from '../domain/block-range.js';
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
  /** Số đoạn tối đa mỗi vòng: vòng đầu bắt kịp nhanh nhưng không dồn quá nhiều lời gọi RPC. */
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
}

/**
 * Worker: quét log của từng contract trong danh mục và ghi blockchain_events.
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
    for (const contract of contracts) {
      try {
        await this.indexContract(contract, head, finalized, summary);
      } catch (error) {
        summary.failed.push(contract.name);
        this.logger.error(
          `Không quét được log ${contract.name}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    return summary;
  }

  private async indexContract(
    contract: IndexedContract,
    head: bigint,
    finalized: bigint,
    summary: IndexingSummary,
  ): Promise<void> {
    let checkpoint =
      (await this.checkpoints.find(this.reader.chainId, contract.address)) ??
      (await this.start(contract, finalized));
    if (finalized < checkpoint.lastFinalizedBlock) {
      summary.behind.push(contract.name);
      return;
    }

    for (let run = 0; run < this.settings.maxRangesPerRun; run += 1) {
      const range = nextBlockRange(checkpoint.lastFinalizedBlock, finalized, this.blockRange);
      if (!range) {
        break;
      }
      checkpoint = await this.finalizeRange(contract, checkpoint, range, summary);
    }
    if (checkpoint.lastFinalizedBlock < finalized) {
      return;
    }

    const lastScanned =
      checkpoint.lastObservedBlock > finalized ? checkpoint.lastObservedBlock : finalized;
    const tail = nextBlockRange(lastScanned, head, this.blockRange);
    if (tail) {
      await this.observeRange(contract, checkpoint, tail, summary);
    }
  }

  /** Đoạn đã finalized: kết quả eth_getLogs lúc này là chuẩn, không còn thay đổi. */
  private async finalizeRange(
    contract: IndexedContract,
    checkpoint: IndexerCheckpoint,
    range: BlockRange,
    summary: IndexingSummary,
  ): Promise<IndexerCheckpoint> {
    const { logs, scanned } = await this.fetchLogs(contract.address, range);
    const anchor = await this.reader.getBlock(scanned.to);
    if (!anchor) {
      throw new Error(`RPC chưa có block ${scanned.to}`);
    }
    const events = await this.toEvents(logs, true);

    return this.unitOfWork.run(async (scope) => {
      for (const event of events) {
        const eventId = await this.events.finalize(event, scope);
        if (eventId) {
          summary.finalized += 1;
          await this.projectors
            .find(event.contractName, event.eventName)
            ?.project({ ...event, eventId }, scope);
        }
      }
      summary.orphaned += await this.events.orphanPending(
        this.reader.chainId,
        contract.address,
        scanned,
        scope,
      );
      const next = advanceFinalized(checkpoint, { number: scanned.to, hash: anchor.hash });
      await this.checkpoints.save(next, scope);
      return next;
    });
  }

  /** Block chưa finalized: ghi PENDING để biết sớm, chưa chiếu sang bảng nghiệp vụ. */
  private async observeRange(
    contract: IndexedContract,
    checkpoint: IndexerCheckpoint,
    range: BlockRange,
    summary: IndexingSummary,
  ): Promise<void> {
    const { logs, scanned } = await this.fetchLogs(contract.address, range);
    const events = await this.toEvents(logs, false);
    await this.unitOfWork.run(async (scope) => {
      for (const event of events) {
        await this.events.recordObserved(event, scope);
      }
      await this.checkpoints.save(advanceObserved(checkpoint, scanned.to), scope);
    });
    summary.observed += events.length;
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
      throw new Error(`RPC không trả block ${anchorNumber}`);
    }
    const checkpoint = initialCheckpoint(this.reader.chainId, contract.address, {
      number: anchorNumber,
      hash: anchor.hash,
    });
    await this.checkpoints.save(checkpoint);
    return checkpoint;
  }

  /** RPC giới hạn số block mỗi lần thì chia đôi đoạn và giữ kích thước nhỏ hơn cho các vòng sau. */
  private async fetchLogs(
    address: string,
    range: BlockRange,
  ): Promise<{ logs: ChainLogEntry[]; scanned: BlockRange }> {
    let scanned = range;
    for (;;) {
      try {
        const logs = await this.reader.getLogs({
          address,
          fromBlock: scanned.from,
          toBlock: scanned.to,
        });
        return { logs, scanned };
      } catch (error) {
        if (!(error instanceof LogRangeTooLargeError) || scanned.from === scanned.to) {
          throw error;
        }
        this.blockRange = Math.max(1, Math.floor(blockCount(scanned) / 2));
        this.logger.warn(
          `RPC giới hạn eth_getLogs, giảm còn ${this.blockRange} block mỗi lần (đặt INDEXER_BLOCK_RANGE cho khớp)`,
        );
        scanned = { from: scanned.from, to: scanned.from + BigInt(this.blockRange) - 1n };
      }
    }
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
        throw new Error(`RPC không trả block ${log.blockNumber}`);
      }
      blocks.set(log.blockNumber, block);
      if (canonical && block.hash !== log.blockHash) {
        throw new Error(`Log và block ${log.blockNumber} lệch hash, đọc lại ở vòng sau`);
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
}
