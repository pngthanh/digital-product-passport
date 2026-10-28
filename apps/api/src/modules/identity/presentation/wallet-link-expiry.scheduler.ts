import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ExpireWalletLinks } from '../application/expire-wallet-links.use-case.js';

const EXPIRY_INTERVAL_MS = 60_000;

/** Tác nhân Scheduler (Worker): dọn yêu cầu liên kết ví đã quá hạn giấy phép. */
@Injectable()
export class WalletLinkExpiryScheduler {
  private readonly logger = new Logger(WalletLinkExpiryScheduler.name);

  constructor(private readonly expireWalletLinks: ExpireWalletLinks) {}

  @Interval(EXPIRY_INTERVAL_MS)
  async tick(): Promise<void> {
    try {
      const removed = await this.expireWalletLinks.runOnce();
      if (removed > 0) {
        this.logger.log(`Đã bỏ ${removed} yêu cầu liên kết ví quá hạn`);
      }
    } catch (error) {
      this.logger.warn(
        `Chưa dọn được yêu cầu liên kết ví: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
