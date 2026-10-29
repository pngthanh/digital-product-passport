import { Inject, Injectable } from '@nestjs/common';
import { type ChainEventView, toChecksumAddress } from '@dpp/shared';
import type { RecordedChainEvent } from '../domain/chain-event.js';
import { CHAIN_READER, type ChainReader } from './chain-reader.port.js';
import { CONTRACT_CATALOG, type ContractCatalog } from './contract-catalog.port.js';

/** Đọc blockchain_events (chỉ đọc, phía API). */
export interface ChainEventReader {
  byCorrelation(
    chainId: number,
    contractAddress: string,
    correlationKey: string,
  ): Promise<RecordedChainEvent[]>;
  /** Chỉ lấy event của `contractAddresses` (contract đang dùng), không lẫn bản deploy cũ. */
  byProduct(
    chainId: number,
    contractAddresses: readonly string[],
    chainProductIds: readonly string[],
  ): Promise<RecordedChainEvent[]>;
}

export const CHAIN_EVENT_READER = Symbol('CHAIN_EVENT_READER');

/** Lịch sử event FINALIZED của một đối tượng, cũ nhất trước, để người dùng đối chiếu trên explorer. */
@Injectable()
export class ChainEventHistory {
  constructor(
    @Inject(CHAIN_EVENT_READER) private readonly events: ChainEventReader,
    @Inject(CONTRACT_CATALOG) private readonly catalog: ContractCatalog,
    @Inject(CHAIN_READER) private readonly reader: ChainReader,
  ) {}

  /** Event của contract `contractName` có correlation_key (partyId, requestId…) này. */
  async ofCorrelation(contractName: string, correlationKey: string): Promise<RecordedChainEvent[]> {
    const address = this.catalog.addressOf(contractName);
    return address
      ? this.events.byCorrelation(this.reader.chainId, address, correlationKey.toLowerCase())
      : [];
  }

  /**
   * Event của các sản phẩm (theo productId on-chain) từ các contract đang cấu hình. productId không
   * đổi khi deploy lại ProductPassport, nên event của bản deploy cũ được bỏ qua.
   */
  ofProducts(chainProductIds: readonly string[]): Promise<RecordedChainEvent[]> {
    const contracts = this.catalog.indexedContracts().map((contract) => contract.address);
    return chainProductIds.length === 0 || contracts.length === 0
      ? Promise.resolve([])
      : this.events.byProduct(
          this.reader.chainId,
          contracts,
          chainProductIds.map((id) => id.toLowerCase()),
        );
  }
}

/** Dạng trả cho Web: số block thành chuỗi, địa chỉ ví dạng checksum. */
export function presentChainEvent(event: RecordedChainEvent): ChainEventView {
  return {
    eventName: event.eventName,
    txHash: event.txHash,
    blockNumber: event.blockNumber.toString(),
    logIndex: event.logIndex,
    blockTimestamp: event.blockTimestamp.toISOString(),
    actorAddress: event.actorAddress ? toChecksumAddress(event.actorAddress) : null,
    args: { ...event.args },
  };
}
