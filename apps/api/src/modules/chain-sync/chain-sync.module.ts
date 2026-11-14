import { Module } from '@nestjs/common';
import { CLOCK, SYSTEM_CLOCK } from '../../common/time/clock.js';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { CHAIN_EVENT_READER, ChainEventHistory } from './application/chain-event-history.query.js';
import { CHAIN_READER } from './application/chain-reader.port.js';
import { CHAIN_TRANSACTION_REPOSITORY } from './application/chain-transaction.repository.js';
import { CONTRACT_CATALOG } from './application/contract-catalog.port.js';
import { EVENT_STORE } from './application/event-store.port.js';
import { IndexedChainState } from './application/indexed-chain-state.query.js';
import { INDEXER_CHECKPOINT_REPOSITORY } from './application/indexer-checkpoint.repository.js';
import { IndexerProgress } from './application/indexer-progress.query.js';
import {
  TRANSACTION_TRACKING,
  TransactionTracker,
} from './application/transaction-tracker.service.js';
import { AbiContractCatalog } from './infrastructure/abi-contract.catalog.js';
import { EthersChainReader } from './infrastructure/ethers-chain.reader.js';
import { PrismaChainEventReader } from './infrastructure/prisma-chain-event.reader.js';
import { PrismaChainTransactionRepository } from './infrastructure/prisma-chain-transaction.repository.js';
import { PrismaEventStore } from './infrastructure/prisma-event.store.js';
import { PrismaIndexerCheckpointRepository } from './infrastructure/prisma-indexer-checkpoint.repository.js';

const PORTS = [
  { provide: CHAIN_READER, useClass: EthersChainReader },
  { provide: CONTRACT_CATALOG, useClass: AbiContractCatalog },
  { provide: CHAIN_TRANSACTION_REPOSITORY, useClass: PrismaChainTransactionRepository },
  { provide: INDEXER_CHECKPOINT_REPOSITORY, useClass: PrismaIndexerCheckpointRepository },
  { provide: CHAIN_EVENT_READER, useClass: PrismaChainEventReader },
  // (M11) Đọc event sau mốc Indexer để đối chiếu hộ chiếu công khai; API không ghi event.
  { provide: EVENT_STORE, useClass: PrismaEventStore },
  { provide: CLOCK, useValue: SYSTEM_CLOCK },
];

/**
 * Phần dùng chung cho API và Worker: theo dõi giao dịch ví người dùng gửi, tiến độ Indexer, lịch sử
 * event, mốc đã chốt để đối chiếu với contract (M11).
 */
@Module({
  imports: [DatabaseModule, BlockchainModule],
  providers: [
    ...PORTS,
    TransactionTracker,
    { provide: TRANSACTION_TRACKING, useExisting: TransactionTracker },
    IndexerProgress,
    ChainEventHistory,
    IndexedChainState,
  ],
  exports: [
    TRANSACTION_TRACKING,
    CHAIN_READER,
    CONTRACT_CATALOG,
    CHAIN_TRANSACTION_REPOSITORY,
    INDEXER_CHECKPOINT_REPOSITORY,
    IndexerProgress,
    ChainEventHistory,
    IndexedChainState,
  ],
})
export class ChainSyncModule {}
