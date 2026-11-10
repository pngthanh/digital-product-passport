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

/**
 * Khi bắt kịp, mỗi lượt gọi song song 10 đoạn (1.000 block với đoạn 100 block), mỗi lời gọi lấy log
 * của mọi contract; khoảng 20–25 request/giây, dưới giới hạn 50 request/giây của RPC công khai Monad.
 */
const PARALLEL_RANGES = 10;
/** Mỗi vòng tối đa 100 đoạn (10.000 block) để một vòng không kéo quá lâu. */
const MAX_RANGES_PER_RUN = 100;

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
        parallelRanges: PARALLEL_RANGES,
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
