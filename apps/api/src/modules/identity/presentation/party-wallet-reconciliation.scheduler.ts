import { Injectable, Logger, type OnApplicationBootstrap, Optional } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AppConfigService } from '../../../config/app-config.service.js';
import { ReconcilePartyWallets } from '../application/reconcile-party-wallets.use-case.js';

const INTERVAL_NAME = 'party-wallet-reconciliation';

/** Tác nhân Scheduler (Worker): đối soát ví theo chu kỳ RECONCILE_INTERVAL_MINUTES. */
@Injectable()
export class PartyWalletReconciliationScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(PartyWalletReconciliationScheduler.name);
  private running = false;

  constructor(
    private readonly reconcile: ReconcilePartyWallets,
    private readonly config: AppConfigService,
    @Optional() private readonly registry?: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    this.registry?.addInterval(
      INTERVAL_NAME,
      setInterval(() => void this.tick(), this.config.indexer.reconcileIntervalMs),
    );
  }

  async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const summary = await this.reconcile.runOnce();
      if (summary.mismatched > 0) {
        this.logger.warn(
          `Đối soát ví tại block ${summary.atBlock}: ${summary.mismatched}/${summary.checked} Party lệch on-chain, ${summary.raised} cảnh báo mới`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Chưa đối soát được ví: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
