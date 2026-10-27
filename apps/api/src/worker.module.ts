import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppConfigModule } from './config/app-config.module.js';
import { HealthModule } from './modules/health/index.js';

/**
 * Module gốc của tiến trình Worker (không mở cổng HTTP).
 * Indexer (M3) và các job của Scheduler (expire transfer, đối soát…) được đăng ký tại đây.
 */
@Module({
  imports: [AppConfigModule, ScheduleModule.forRoot(), HealthModule],
})
export class WorkerModule {}
