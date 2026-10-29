import { Module } from '@nestjs/common';
import { CLOCK, SYSTEM_CLOCK } from '../../common/time/clock.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { ChainSyncModule } from './chain-sync.module.js';
import { ConfirmTransactions } from './application/confirm-transactions.use-case.js';
import { EventProjectorRegistry } from './application/event-projector.js';
import { EVENT_STORE } from './application/event-store.port.js';
import { IndexedChainState } from './application/indexed-chain-state.query.js';
import {
  INDEXER_SETTINGS,
  IndexChainEvents,
  type IndexerSettings,
} from './application/index-chain-events.use-case.js';
import { PrismaEventStore } from './infrastructure/prisma-event.store.js';
import { ChainIndexerScheduler } from './presentation/chain-indexer.scheduler.js';
import { TransactionConfirmationScheduler } from './presentation/transaction-confirmation.scheduler.js';

/** Mỗi vòng quét tối đa 10 đoạn (1.000 block với đoạn 100 block) để bắt kịp mà không dồn RPC. */
const MAX_RANGES_PER_RUN = 10;

/** Phần chạy trong Worker: Indexer quét log, chốt giao dịch, ghi blockchain_events, gọi projector. */
@Module({
  imports: [DatabaseModule, ChainSyncModule],
  providers: [
    { provide: EVENT_STORE, useClass: PrismaEventStore },
    { provide: CLOCK, useValue: SYSTEM_CLOCK },
    {
      provide: INDEXER_SETTINGS,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): IndexerSettings => ({
        blockRange: config.indexer.blockRange,
        pollIntervalMs: config.indexer.pollIntervalMs,
        maxRangesPerRun: MAX_RANGES_PER_RUN,
      }),
    },
    EventProjectorRegistry,
    ConfirmTransactions,
    IndexChainEvents,
    IndexedChainState,
    TransactionConfirmationScheduler,
    ChainIndexerScheduler,
  ],
  exports: [
    EventProjectorRegistry,
    ConfirmTransactions,
    IndexChainEvents,
    IndexedChainState,
    ChainSyncModule,
  ],
})
export class ChainSyncWorkerModule {}
