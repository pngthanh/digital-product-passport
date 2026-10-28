import { Module } from '@nestjs/common';
import { CLOCK, SYSTEM_CLOCK } from '../../common/time/clock.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { ChainSyncModule } from './chain-sync.module.js';
import { ConfirmTransactions } from './application/confirm-transactions.use-case.js';
import { EventProjectorRegistry } from './application/event-projector.js';
import { EVENT_STORE } from './application/event-store.port.js';
import { PrismaEventStore } from './infrastructure/prisma-event.store.js';
import { TransactionConfirmationScheduler } from './presentation/transaction-confirmation.scheduler.js';

/** Phần chạy trong Worker: chốt giao dịch, ghi blockchain_events, gọi projector. */
@Module({
  imports: [DatabaseModule, ChainSyncModule],
  providers: [
    { provide: EVENT_STORE, useClass: PrismaEventStore },
    { provide: CLOCK, useValue: SYSTEM_CLOCK },
    EventProjectorRegistry,
    ConfirmTransactions,
    TransactionConfirmationScheduler,
  ],
  exports: [EventProjectorRegistry, ConfirmTransactions, ChainSyncModule],
})
export class ChainSyncWorkerModule {}
