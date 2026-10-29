import { Inject, Injectable } from '@nestjs/common';
import { CHAIN_READER, type ChainReader } from './chain-reader.port.js';
import { CONTRACT_CATALOG, type ContractCatalog } from './contract-catalog.port.js';
import { EVENT_STORE, type EventStore } from './event-store.port.js';
import {
  INDEXER_CHECKPOINT_REPOSITORY,
  type IndexerCheckpointRepository,
} from './indexer-checkpoint.repository.js';

/**
 * Mốc để module nghiệp vụ đối soát dữ liệu chiếu với hàm view on-chain.
 * Thứ tự đúng: đọc `indexedBlock`, rồi đọc dữ liệu chiếu, rồi mới đọc `keysChangedAfter`,
 * để mọi thay đổi đã chiếu sau mốc đều hiện trong danh sách bỏ qua.
 */
@Injectable()
export class IndexedChainState {
  constructor(
    @Inject(CHAIN_READER) private readonly reader: ChainReader,
    @Inject(CONTRACT_CATALOG) private readonly catalog: ContractCatalog,
    @Inject(INDEXER_CHECKPOINT_REPOSITORY)
    private readonly checkpoints: IndexerCheckpointRepository,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  /** Mọi event tới block này đã chốt và chiếu; `null` khi chưa cấu hình hoặc Indexer chưa quét. */
  async indexedBlock(contractName: string): Promise<bigint | null> {
    const address = this.catalog.addressOf(contractName);
    const checkpoint = address ? await this.checkpoints.find(this.reader.chainId, address) : null;
    return checkpoint?.lastFinalizedBlock ?? null;
  }

  /** Đối tượng (correlation_key) có event sau `block`: dữ liệu đang thay đổi, chưa so được. */
  async keysChangedAfter(contractName: string, block: bigint): Promise<ReadonlySet<string>> {
    const address = this.catalog.addressOf(contractName);
    if (!address) {
      return new Set();
    }
    return new Set(await this.events.correlationKeysAfter(this.reader.chainId, address, block));
  }
}
