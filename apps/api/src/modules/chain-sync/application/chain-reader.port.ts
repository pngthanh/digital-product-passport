/** Dữ liệu đọc từ RPC, đã chuẩn hoá (địa chỉ và hash chữ thường, số dạng bigint). */
export interface ChainTransactionInfo {
  hash: string;
  from: string;
  to: string | null;
  data: string;
  nonce: number;
  gasLimit: bigint;
  maxFeePerGas: bigint | null;
  maxPriorityFeePerGas: bigint | null;
  value: bigint;
}

export interface ChainLog {
  address: string;
  topics: readonly string[];
  data: string;
  logIndex: number;
}

/** Log lấy từ eth_getLogs, kèm vị trí trong chain. */
export interface ChainLogEntry extends ChainLog {
  blockNumber: bigint;
  blockHash: string;
  txHash: string;
  txIndex: number;
}

export interface ChainReceipt {
  succeeded: boolean;
  blockNumber: bigint;
  blockHash: string;
  transactionIndex: number;
  from: string;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  logs: readonly ChainLog[];
}

export interface ChainBlock {
  hash: string;
  timestamp: Date;
}

export interface LogFilter {
  address: string;
  fromBlock: bigint;
  toBlock: bigint;
}

/** RPC từ chối eth_getLogs vì đoạn block quá dài; Indexer chia nhỏ đoạn rồi thử lại. */
export class LogRangeTooLargeError extends Error {
  constructor(readonly blocks: number) {
    super(`RPC từ chối eth_getLogs cho ${blocks} block`);
    this.name = 'LogRangeTooLargeError';
  }
}

export interface ChainReader {
  readonly chainId: number;
  getTransaction(txHash: string): Promise<ChainTransactionInfo | null>;
  getReceipt(txHash: string): Promise<ChainReceipt | null>;
  getLatestBlockNumber(): Promise<bigint>;
  getFinalizedBlockNumber(): Promise<bigint | null>;
  getBlock(blockNumber: bigint): Promise<ChainBlock | null>;
  /** Ném `LogRangeTooLargeError` khi RPC giới hạn số block mỗi lần gọi. */
  getLogs(filter: LogFilter): Promise<ChainLogEntry[]>;
}

export const CHAIN_READER = Symbol('CHAIN_READER');
