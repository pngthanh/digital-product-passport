import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppConfigModule } from './config/app-config.module.js';
import { ChainSyncWorkerModule } from './modules/chain-sync/index.js';
import { HealthModule } from './modules/health/index.js';
import { IdentityWorkerModule } from './modules/identity/index.js';

/**
 * Module gốc của tiến trình Worker (không mở cổng HTTP).
 * Chốt giao dịch và chiếu event (M2), Indexer quét log (M3) và các job Scheduler đăng ký tại đây.
 */
@Module({
  imports: [
    AppConfigModule,
    ScheduleModule.forRoot(),
    HealthModule,
    ChainSyncWorkerModule,
    IdentityWorkerModule,
  ],
})
export class WorkerModule {}
