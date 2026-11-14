import { Injectable } from '@nestjs/common';
import { ChainProviderService } from '../../../infrastructure/blockchain/chain-provider.service.js';
import type { ChainHeadReader } from '../application/ports/chain-head.reader.js';

@Injectable()
export class EthersChainHeadReader implements ChainHeadReader {
  constructor(private readonly chain: ChainProviderService) {}

  async finalizedBlock(): Promise<{ number: bigint; time: Date } | null> {
    const { result } = await this.chain.withFailover((provider) => provider.getBlock('finalized'));
    return result
      ? { number: BigInt(result.number), time: new Date(result.timestamp * 1000) }
      : null;
  }

  async blockTime(blockNumber: bigint): Promise<Date | null> {
    const { result } = await this.chain.withFailover((provider) => provider.getBlock(blockNumber));
    return result ? new Date(result.timestamp * 1000) : null;
  }
}
