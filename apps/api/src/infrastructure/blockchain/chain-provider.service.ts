import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { FetchRequest, JsonRpcProvider, Network } from 'ethers';
import { AppConfigService } from '../../config/app-config.service.js';

export type RpcEndpointRole = 'primary' | 'fallback';

export interface ChainHead {
  chainId: number;
  latestBlock: number;
  /** Block mới nhất không thể reorg (tag `finalized`); `null` nếu RPC không hỗ trợ. */
  finalizedBlock: number | null;
  endpoint: RpcEndpointRole;
}

interface RpcEndpoint {
  role: RpcEndpointRole;
  provider: JsonRpcProvider;
}

/** Cổng JSON-RPC tới blockchain, tự chuyển sang RPC dự phòng khi RPC chính lỗi. */
@Injectable()
export class ChainProviderService implements OnModuleDestroy {
  private readonly endpoints: RpcEndpoint[];

  constructor(config: AppConfigService) {
    const { chainId, network, rpcUrls, timeoutMs } = config.chain;
    const staticNetwork = new Network(network.name, chainId);
    this.endpoints = rpcUrls.map((url, index) => ({
      role: index === 0 ? 'primary' : 'fallback',
      provider: createProvider(url, staticNetwork, timeoutMs),
    }));
  }

  /** Chạy thao tác trên RPC chính, lỗi thì thử lần lượt các RPC dự phòng. */
  async withFailover<T>(
    operation: (provider: JsonRpcProvider) => Promise<T>,
  ): Promise<{ result: T; endpoint: RpcEndpointRole }> {
    let lastError: unknown = new Error('Chưa cấu hình RPC nào');
    for (const { role, provider } of this.endpoints) {
      try {
        return { result: await operation(provider), endpoint: role };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  /** Chain ID thật do RPC trả về (provider dùng static network nên không tự hỏi lại). */
  async readChainId(): Promise<number> {
    const { result } = await this.withFailover((provider) => requestChainId(provider));
    return result;
  }

  async readHead(): Promise<ChainHead> {
    const { result, endpoint } = await this.withFailover(async (provider) => {
      const [chainId, latestBlock, finalized] = await Promise.all([
        requestChainId(provider),
        provider.getBlockNumber(),
        provider.getBlock('finalized'),
      ]);
      return { chainId, latestBlock, finalizedBlock: finalized?.number ?? null };
    });
    return { ...result, endpoint };
  }

  onModuleDestroy(): void {
    for (const { provider } of this.endpoints) {
      provider.destroy();
    }
  }
}

async function requestChainId(provider: JsonRpcProvider): Promise<number> {
  const response: unknown = await provider.send('eth_chainId', []);
  if (typeof response !== 'string' || !/^0x[0-9a-fA-F]+$/.test(response)) {
    throw new Error(`eth_chainId trả về giá trị không hợp lệ: ${String(response)}`);
  }
  return Number(BigInt(response));
}

function createProvider(url: string, network: Network, timeoutMs: number): JsonRpcProvider {
  const request = new FetchRequest(url);
  request.timeout = timeoutMs;
  return new JsonRpcProvider(request, network, { staticNetwork: network, batchMaxCount: 1 });
}
