import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ExpireWarranties } from '../application/expire-warranties.use-case.js';

const EXPIRY_INTERVAL_MS = 10 * 60_000;

/** Tác nhân Scheduler (Worker): bảo hành quá hạn chuyển sang EXPIRED trong CSDL. */
@Injectable()
export class WarrantyExpiryScheduler {
  private readonly logger = new Logger(WarrantyExpiryScheduler.name);

  constructor(private readonly expireWarranties: ExpireWarranties) {}

  @Interval(EXPIRY_INTERVAL_MS)
  async tick(): Promise<void> {
    try {
      const expired = await this.expireWarranties.runOnce();
      if (expired > 0) {
        this.logger.log(`${expired} bảo hành đã hết hạn`);
      }
    } catch (error) {
      this.logger.warn(
        `Chưa đồng bộ được bảo hành hết hạn: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
