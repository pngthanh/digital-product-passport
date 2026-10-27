import { Module } from '@nestjs/common';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { HEALTH_INDICATORS, type HealthIndicator } from './application/health-indicator.port.js';
import { HealthService } from './application/health.service.js';
import { StartupHealthLogger } from './application/startup-health-logger.service.js';
import { ChainHealthIndicator } from './infrastructure/chain-health.indicator.js';
import { DatabaseHealthIndicator } from './infrastructure/database-health.indicator.js';
import { HealthController } from './presentation/health.controller.js';

@Module({
  imports: [DatabaseModule, BlockchainModule],
  controllers: [HealthController],
  providers: [
    DatabaseHealthIndicator,
    ChainHealthIndicator,
    {
      provide: HEALTH_INDICATORS,
      useFactory: (
        database: DatabaseHealthIndicator,
        chain: ChainHealthIndicator,
      ): HealthIndicator[] => [database, chain],
      inject: [DatabaseHealthIndicator, ChainHealthIndicator],
    },
    HealthService,
    StartupHealthLogger,
  ],
  exports: [HealthService],
})
export class HealthModule {}
