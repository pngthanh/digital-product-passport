import { Module } from '@nestjs/common';
import { CLOCK, SYSTEM_CLOCK } from '../../common/time/clock.js';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { CHAIN_READER } from './application/chain-reader.port.js';
import { CHAIN_TRANSACTION_REPOSITORY } from './application/chain-transaction.repository.js';
import { CONTRACT_CATALOG } from './application/contract-catalog.port.js';
import { INDEXER_CHECKPOINT_REPOSITORY } from './application/indexer-checkpoint.repository.js';
import { IndexerProgress } from './application/indexer-progress.query.js';
import {
  TRANSACTION_TRACKING,
  TransactionTracker,
} from './application/transaction-tracker.service.js';
import { AbiContractCatalog } from './infrastructure/abi-contract.catalog.js';
import { EthersChainReader } from './infrastructure/ethers-chain.reader.js';
import { PrismaChainTransactionRepository } from './infrastructure/prisma-chain-transaction.repository.js';
import { PrismaIndexerCheckpointRepository } from './infrastructure/prisma-indexer-checkpoint.repository.js';

const PORTS = [
  { provide: CHAIN_READER, useClass: EthersChainReader },
  { provide: CONTRACT_CATALOG, useClass: AbiContractCatalog },
  { provide: CHAIN_TRANSACTION_REPOSITORY, useClass: PrismaChainTransactionRepository },
  { provide: INDEXER_CHECKPOINT_REPOSITORY, useClass: PrismaIndexerCheckpointRepository },
  { provide: CLOCK, useValue: SYSTEM_CLOCK },
];

/** Phần dùng chung cho API và Worker: theo dõi giao dịch do ví người dùng gửi, đọc tiến độ Indexer. */
@Module({
  imports: [DatabaseModule, BlockchainModule],
  providers: [
    ...PORTS,
    TransactionTracker,
    { provide: TRANSACTION_TRACKING, useExisting: TransactionTracker },
    IndexerProgress,
  ],
  exports: [
    TRANSACTION_TRACKING,
    CHAIN_READER,
    CONTRACT_CATALOG,
    CHAIN_TRANSACTION_REPOSITORY,
    INDEXER_CHECKPOINT_REPOSITORY,
    IndexerProgress,
  ],
})
export class ChainSyncModule {}
