import { Inject, Injectable } from '@nestjs/common';
import { CHAIN_READER, type ChainReader } from './chain-reader.port.js';
import { CONTRACT_CATALOG, type ContractCatalog } from './contract-catalog.port.js';
import {
  INDEXER_CHECKPOINT_REPOSITORY,
  type IndexerCheckpointRepository,
  type StoredCheckpoint,
} from './indexer-checkpoint.repository.js';

export interface ContractProgress {
  contractName: string;
  contractAddress: string;
  /** `null` khi Worker chưa quét contract này lần nào. */
  checkpoint: StoredCheckpoint | null;
}

/** Tiến độ Indexer theo từng contract, đọc từ indexer_checkpoints (dùng cho /health/ready). */
@Injectable()
export class IndexerProgress {
  constructor(
    @Inject(CHAIN_READER) private readonly reader: ChainReader,
    @Inject(CONTRACT_CATALOG) private readonly catalog: ContractCatalog,
    @Inject(INDEXER_CHECKPOINT_REPOSITORY)
    private readonly checkpoints: IndexerCheckpointRepository,
  ) {}

  async read(): Promise<ContractProgress[]> {
    return Promise.all(
      this.catalog.indexedContracts().map(async (contract) => ({
        contractName: contract.name,
        contractAddress: contract.address,
        checkpoint: await this.checkpoints.find(this.reader.chainId, contract.address),
      })),
    );
  }
}
