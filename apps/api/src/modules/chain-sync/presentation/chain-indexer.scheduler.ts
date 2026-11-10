import { Inject, Injectable, Logger, type OnApplicationBootstrap, Optional } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
  INDEXER_SETTINGS,
  IndexChainEvents,
  type IndexerSettings,
} from '../application/index-chain-events.use-case.js';

const INTERVAL_NAME = 'chain-indexer';
/** Chậm hơn số block này thì coi là đang bắt kịp và báo tiến độ trong log. */
const CATCH_UP_THRESHOLD_BLOCKS = 1_000n;
/** Báo tiến độ bắt kịp tối đa 30 giây một lần. */
const PROGRESS_LOG_INTERVAL_MS = 30_000;

/**
 * Tác nhân Scheduler (Worker): quét log theo chu kỳ INDEXER_POLL_INTERVAL_MS.
 * Không có ScheduleModule (test) thì không tự chạy, test gọi `IndexChainEvents.runOnce()`.
 */
@Injectable()
export class ChainIndexerScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ChainIndexerScheduler.name);
  private running = false;
  private behindWarned = false;
  /** Lần báo tiến độ trước, để tính tốc độ và thời gian còn lại. */
  private lastProgress: { at: number; remaining: bigint } | null = null;

  constructor(
    private readonly indexer: IndexChainEvents,
    @Inject(INDEXER_SETTINGS) private readonly settings: IndexerSettings,
    @Optional() private readonly registry?: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    // ScheduleModule tự xoá interval đã đăng ký khi tiến trình dừng.
    this.registry?.addInterval(
      INTERVAL_NAME,
      setInterval(() => void this.tick(), this.settings.pollIntervalMs),
    );
  }

  async tick(): Promise<void> {
    // RPC chậm thì một vòng có thể dài hơn chu kỳ; không chạy chồng hai vòng.
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const summary = await this.indexer.runOnce();
      if (summary.finalized > 0 || summary.orphaned > 0) {
        this.logger.log(
          `Indexer chốt ${summary.finalized} event, ${summary.orphaned} event bị loại do reorg`,
        );
      }
      this.warnIfBehind(summary.behind);
      this.reportProgress(summary.remainingBlocks);
    } catch (error) {
      this.logger.warn(
        `Indexer chưa quét được: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  /** Máy tắt lâu thì Worker phải quét bù nhiều block: báo còn bao nhiêu và ước tính bao lâu. */
  private reportProgress(remaining: bigint): void {
    const now = Date.now();
    if (remaining <= CATCH_UP_THRESHOLD_BLOCKS) {
      if (this.lastProgress) {
        this.lastProgress = null;
        this.logger.log('Indexer đã bắt kịp chain');
      }
      return;
    }
    const previous = this.lastProgress;
    if (previous && now - previous.at < PROGRESS_LOG_INTERVAL_MS) {
      return;
    }
    const done = previous ? Number(previous.remaining - remaining) : 0;
    const perSecond = previous && done > 0 ? done / ((now - previous.at) / 1000) : 0;
    const eta =
      perSecond > 0 ? `, khoảng ${Math.ceil(Number(remaining) / perSecond / 60)} phút nữa` : '';
    this.logger.log(
      `Indexer đang bắt kịp chain: còn ${formatBlocks(remaining)} block${eta}. Thao tác mới chỉ hiện trên web sau khi bắt kịp.`,
    );
    this.lastProgress = { at: now, remaining };
  }

  private warnIfBehind(contracts: readonly string[]): void {
    if (contracts.length === 0) {
      this.behindWarned = false;
      return;
    }
    if (!this.behindWarned) {
      this.behindWarned = true;
      this.logger.warn(
        `RPC báo block finalized thấp hơn mốc đã quét của ${contracts.join(', ')}. ` +
          'Nếu vừa khởi động lại Hardhat node thì chạy `pnpm --filter @dpp/api db:reset` (chain local đã mất dữ liệu cũ).',
      );
    }
  }
}

/** 3155733n → "3.155.733". */
function formatBlocks(blocks: bigint): string {
  return blocks.toLocaleString('vi-VN');
}
