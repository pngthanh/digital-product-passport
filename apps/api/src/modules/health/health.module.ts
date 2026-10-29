import { Module } from '@nestjs/common';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { ChainSyncModule } from '../chain-sync/index.js';
import { HEALTH_INDICATORS, type HealthIndicator } from './application/health-indicator.port.js';
import { HealthService } from './application/health.service.js';
import { StartupHealthLogger } from './application/startup-health-logger.service.js';
import { ChainHealthIndicator } from './infrastructure/chain-health.indicator.js';
import { DatabaseHealthIndicator } from './infrastructure/database-health.indicator.js';
import { IndexerHealthIndicator } from './infrastructure/indexer-health.indicator.js';
import { HealthController } from './presentation/health.controller.js';

@Module({
  imports: [DatabaseModule, BlockchainModule, ChainSyncModule],
  controllers: [HealthController],
  providers: [
    DatabaseHealthIndicator,
    ChainHealthIndicator,
    IndexerHealthIndicator,
    {
      provide: HEALTH_INDICATORS,
      useFactory: (
        database: DatabaseHealthIndicator,
        chain: ChainHealthIndicator,
        indexer: IndexerHealthIndicator,
      ): HealthIndicator[] => [database, chain, indexer],
      inject: [DatabaseHealthIndicator, ChainHealthIndicator, IndexerHealthIndicator],
    },
    HealthService,
    StartupHealthLogger,
  ],
  exports: [HealthService],
})
export class HealthModule {}
