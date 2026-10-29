import { Inject, Injectable, Logger, type OnApplicationBootstrap, Optional } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
  INDEXER_SETTINGS,
  IndexChainEvents,
  type IndexerSettings,
} from '../application/index-chain-events.use-case.js';

const INTERVAL_NAME = 'chain-indexer';

/**
 * Tác nhân Scheduler (Worker): quét log theo chu kỳ INDEXER_POLL_INTERVAL_MS.
 * Không có ScheduleModule (test) thì không tự chạy, test gọi `IndexChainEvents.runOnce()`.
 */
@Injectable()
export class ChainIndexerScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ChainIndexerScheduler.name);
  private running = false;
  private behindWarned = false;

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
    } catch (error) {
      this.logger.warn(
        `Indexer chưa quét được: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
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
