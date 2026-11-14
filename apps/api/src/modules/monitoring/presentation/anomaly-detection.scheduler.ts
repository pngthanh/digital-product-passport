import { Injectable, Logger, type OnApplicationBootstrap, Optional } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AppConfigService } from '../../../config/app-config.service.js';
import { DetectAnomalies } from '../application/detect-anomalies.use-case.js';

const INTERVAL_NAME = 'anomaly-detection';

/** Tác nhân Scheduler (Worker, AUD-03): chạy luật phát hiện bất thường mỗi ANOMALY_SCAN_INTERVAL_MINUTES. */
@Injectable()
export class AnomalyDetectionScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(AnomalyDetectionScheduler.name);
  private running = false;

  constructor(
    private readonly detect: DetectAnomalies,
    private readonly config: AppConfigService,
    @Optional() private readonly registry?: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    this.registry?.addInterval(
      INTERVAL_NAME,
      setInterval(() => void this.tick(), this.config.indexer.anomalyScanIntervalMs),
    );
  }

  async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const summary = await this.detect.runOnce();
      const raised = Object.entries(summary);
      if (raised.length > 0) {
        this.logger.warn(
          `Phát hiện bất thường mới: ${raised.map(([rule, count]) => `${rule} ${count}`).join(', ')}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Chưa chạy được luật phát hiện bất thường: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
