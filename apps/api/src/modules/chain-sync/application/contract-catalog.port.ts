import type { ChainEventArg } from '../domain/chain-event.js';
import type { IndexedContract } from '../domain/indexer-checkpoint.js';
import type { ChainLog } from './chain-reader.port.js';

export interface DecodedLog {
  contractName: string;
  contractAddress: string;
  eventName: string;
  args: Record<string, ChainEventArg>;
  correlationKey: string | null;
}

/** Danh mục contract hệ thống theo dõi: địa chỉ và ABI để giải mã calldata, log. */
export interface ContractCatalog {
  addressOf(contractName: string): string | null;
  /** Contract đã khai báo địa chỉ, theo thứ tự cố định; Indexer quét log của từng contract. */
  indexedContracts(): readonly IndexedContract[];
  /** Tên hàm được gọi trong calldata; `null` nếu không thuộc ABI. */
  decodeMethod(contractName: string, data: string): string | null;
  /** Log của contract lạ hoặc event lạ trả về `null` và bị bỏ qua. */
  decodeLog(log: ChainLog): DecodedLog | null;
}

export const CONTRACT_CATALOG = Symbol('CONTRACT_CATALOG');
