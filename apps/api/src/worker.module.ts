import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppConfigModule } from './config/app-config.module.js';
import { ChainSyncWorkerModule } from './modules/chain-sync/index.js';
import { HealthModule } from './modules/health/index.js';
import { IdentityWorkerModule } from './modules/identity/index.js';
import { InspectionWorkerModule } from './modules/inspection/index.js';
import { OrganizationsWorkerModule } from './modules/organizations/index.js';
import { ProductsWorkerModule } from './modules/products/index.js';
import { ServiceWorkerModule } from './modules/service/index.js';

/**
 * Module gốc của tiến trình Worker (không mở cổng HTTP).
 * Indexer, chốt giao dịch, projector của từng module và các job Scheduler đăng ký tại đây.
 */
@Module({
  imports: [
    AppConfigModule,
    ScheduleModule.forRoot(),
    HealthModule,
    ChainSyncWorkerModule,
    IdentityWorkerModule,
    OrganizationsWorkerModule,
    ProductsWorkerModule,
    ServiceWorkerModule,
    InspectionWorkerModule,
  ],
})
export class WorkerModule {}
