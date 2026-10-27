import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { HealthService } from './health.service.js';

/** Ghi trạng thái hạ tầng một lần khi tiến trình khởi động, để lỗi cấu hình lộ ra sớm. */
@Injectable()
export class StartupHealthLogger implements OnApplicationBootstrap {
  private readonly logger = new Logger('Startup');

  constructor(private readonly health: HealthService) {}

  async onApplicationBootstrap(): Promise<void> {
    const report = await this.health.readiness();
    for (const [key, component] of Object.entries(report.components)) {
      const message = `${key}: ${component.status} (${component.latencyMs} ms)${component.error ? ` — ${component.error}` : ''}`;
      if (component.status === 'up') {
        this.logger.log(message);
      } else {
        this.logger.warn(message);
      }
    }
  }
}
