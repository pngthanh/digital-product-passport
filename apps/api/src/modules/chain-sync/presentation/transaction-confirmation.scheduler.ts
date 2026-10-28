import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConfirmTransactions } from '../application/confirm-transactions.use-case.js';

/** Monad sinh block mỗi ~300 ms và finalized sau 2 block, nên quét mỗi giây là đủ nhanh. */
const CONFIRMATION_INTERVAL_MS = 1_000;

/** Tác nhân Scheduler (Worker): định kỳ chốt giao dịch đang chờ. */
@Injectable()
export class TransactionConfirmationScheduler {
  private readonly logger = new Logger(TransactionConfirmationScheduler.name);
  private running = false;

  constructor(private readonly confirmTransactions: ConfirmTransactions) {}

  @Interval(CONFIRMATION_INTERVAL_MS)
  async tick(): Promise<void> {
    // Một vòng có thể lâu hơn chu kỳ khi RPC chậm; không chạy chồng hai vòng.
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const summary = await this.confirmTransactions.runOnce();
      if (summary.finalized > 0 || summary.dropped > 0) {
        this.logger.log(
          `Đã chốt ${summary.finalized} giao dịch, bỏ ${summary.dropped}, còn chờ ${summary.waiting}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Chưa chốt được giao dịch: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
