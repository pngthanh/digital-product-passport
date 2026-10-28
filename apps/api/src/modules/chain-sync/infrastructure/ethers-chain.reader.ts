import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service.js';
import { ChainProviderService } from '../../../infrastructure/blockchain/chain-provider.service.js';
import type {
  ChainBlock,
  ChainReader,
  ChainReceipt,
  ChainTransactionInfo,
} from '../application/chain-reader.port.js';

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
}
