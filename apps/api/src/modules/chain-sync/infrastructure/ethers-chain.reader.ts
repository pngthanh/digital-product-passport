import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service.js';
import { ChainProviderService } from '../../../infrastructure/blockchain/chain-provider.service.js';
import {
  type ChainBlock,
  type ChainLogEntry,
  type ChainReader,
  type ChainReceipt,
  type ChainTransactionInfo,
  type LogFilter,
  LogRangeTooLargeError,
} from '../application/chain-reader.port.js';

/** Mã lỗi JSON-RPC mà các RPC công khai trả khi eth_getLogs vượt giới hạn số block hoặc số log. */
const RANGE_LIMIT_CODES = new Set([-32602, -32005, -32614]);
const RANGE_LIMIT_MESSAGE =
  /block range|range (is )?too (large|wide|big)|too many blocks|limited to a|returned more than/i;
/** Lỗi do gọi quá nhanh thì không được chia nhỏ đoạn block. */
const RATE_LIMIT_MESSAGE = /rate limit|too many requests|request limit/i;

/** Đọc giao dịch, receipt và block qua JSON-RPC (có RPC dự phòng). */
@Injectable()
export class EthersChainReader implements ChainReader {
  readonly chainId: number;

  constructor(
    private readonly chain: ChainProviderService,
    config: AppConfigService,
  ) {
    this.chainId = config.chain.chainId;
  }

  async getTransaction(txHash: string): Promise<ChainTransactionInfo | null> {
    const { result: tx } = await this.chain.withFailover((provider) =>
      provider.getTransaction(txHash),
    );
    if (!tx) {
      return null;
    }
    return {
      hash: tx.hash.toLowerCase(),
      from: tx.from.toLowerCase(),
      to: tx.to?.toLowerCase() ?? null,
      data: tx.data,
      nonce: tx.nonce,
      gasLimit: tx.gasLimit,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      value: tx.value,
    };
  }

  async getReceipt(txHash: string): Promise<ChainReceipt | null> {
    const { result: receipt } = await this.chain.withFailover((provider) =>
      provider.getTransactionReceipt(txHash),
    );
    if (!receipt) {
      return null;
    }
    return {
      succeeded: receipt.status === 1,
      blockNumber: BigInt(receipt.blockNumber),
      blockHash: receipt.blockHash.toLowerCase(),
      transactionIndex: receipt.index,
      from: receipt.from.toLowerCase(),
      gasUsed: receipt.gasUsed,
      effectiveGasPrice: receipt.gasPrice,
      logs: receipt.logs.map((log) => ({
        address: log.address.toLowerCase(),
        topics: log.topics,
        data: log.data,
        logIndex: log.index,
      })),
    };
  }

  async getLatestBlockNumber(): Promise<bigint> {
    const { result } = await this.chain.withFailover((provider) => provider.getBlockNumber());
    return BigInt(result);
  }

  async getFinalizedBlockNumber(): Promise<bigint | null> {
    const { result: block } = await this.chain.withFailover((provider) =>
      provider.getBlock('finalized'),
    );
    return block ? BigInt(block.number) : null;
  }

  async getBlock(blockNumber: bigint): Promise<ChainBlock | null> {
    const { result: block } = await this.chain.withFailover((provider) =>
      provider.getBlock(blockNumber),
    );
    if (!block?.hash) {
      return null;
    }
    return { hash: block.hash.toLowerCase(), timestamp: new Date(block.timestamp * 1000) };
  }

  async getLogs(filter: LogFilter): Promise<ChainLogEntry[]> {
    try {
      const { result: logs } = await this.chain.withFailover((provider) =>
        provider.getLogs({
          address: filter.address,
          fromBlock: filter.fromBlock,
          toBlock: filter.toBlock,
        }),
      );
      return logs
        .filter((log) => !log.removed)
        .map((log) => ({
          address: log.address.toLowerCase(),
          topics: log.topics,
          data: log.data,
          logIndex: log.index,
          blockNumber: BigInt(log.blockNumber),
          blockHash: log.blockHash.toLowerCase(),
          txHash: log.transactionHash.toLowerCase(),
          txIndex: log.transactionIndex,
        }));
    } catch (error) {
      if (filter.toBlock > filter.fromBlock && isRangeLimitError(error)) {
        throw new LogRangeTooLargeError(Number(filter.toBlock - filter.fromBlock + 1n));
      }
      throw error;
    }
  }
}

/** ethers bọc lỗi JSON-RPC ở `error`, `info.error` hoặc chỉ để trong message. */
function isRangeLimitError(error: unknown): boolean {
  const candidates: unknown[] = [error];
  if (typeof error === 'object' && error !== null) {
    if ('error' in error) {
      candidates.push(error.error);
    }
    if ('info' in error && typeof error.info === 'object' && error.info !== null) {
      candidates.push('error' in error.info ? error.info.error : undefined);
    }
  }
  return candidates.some((candidate) => {
    if (typeof candidate !== 'object' || candidate === null) {
      return false;
    }
    const code = 'code' in candidate ? candidate.code : undefined;
    const message =
      'message' in candidate && typeof candidate.message === 'string' ? candidate.message : '';
    if (RATE_LIMIT_MESSAGE.test(message)) {
      return false;
    }
    return (
      (typeof code === 'number' && RANGE_LIMIT_CODES.has(code)) || RANGE_LIMIT_MESSAGE.test(message)
    );
  });
}
