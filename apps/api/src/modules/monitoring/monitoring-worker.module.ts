import { Module } from '@nestjs/common';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module.js';
import { AuditModule } from '../audit/index.js';
import { ChainSyncWorkerModule } from '../chain-sync/index.js';
import { IdentityWorkerModule } from '../identity/index.js';
import { InspectionWorkerModule } from '../inspection/index.js';
import { ProductsWorkerModule } from '../products/index.js';
import { ServiceWorkerModule } from '../service/index.js';
import { DetectAnomalies } from './application/detect-anomalies.use-case.js';
import { MONITORING_PORT_PROVIDERS } from './monitoring.providers.js';
import { AnomalyDetectionScheduler } from './presentation/anomaly-detection.scheduler.js';

/** Phần chạy trong Worker (AUD-03): luật phát hiện bất thường theo chu kỳ. */
@Module({
  imports: [
    BlockchainModule,
    AuditModule,
    ChainSyncWorkerModule,
    IdentityWorkerModule,
    ProductsWorkerModule,
    ServiceWorkerModule,
    InspectionWorkerModule,
  ],
  providers: [...MONITORING_PORT_PROVIDERS, DetectAnomalies, AnomalyDetectionScheduler],
  exports: [DetectAnomalies],
})
export class MonitoringWorkerModule {}
