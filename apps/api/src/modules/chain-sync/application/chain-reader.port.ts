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

export interface ChainReader {
  readonly chainId: number;
  getTransaction(txHash: string): Promise<ChainTransactionInfo | null>;
  getReceipt(txHash: string): Promise<ChainReceipt | null>;
  getFinalizedBlockNumber(): Promise<bigint | null>;
  getBlock(blockNumber: bigint): Promise<ChainBlock | null>;
}

export const CHAIN_READER = Symbol('CHAIN_READER');
