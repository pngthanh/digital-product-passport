import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service.js';
import { ChainProviderService } from '../../../infrastructure/blockchain/chain-provider.service.js';
import type { HealthIndicator } from '../application/health-indicator.port.js';
import { describeError } from '../application/health.service.js';
import type { ComponentHealth } from '../domain/health-report.js';
import { elapsedSince } from './database-health.indicator.js';

@Injectable()
export class ChainHealthIndicator implements HealthIndicator {
  readonly key = 'chain';

  constructor(
    private readonly config: AppConfigService,
    private readonly chain: ChainProviderService,
  ) {}

  async check(): Promise<ComponentHealth> {
    const { chainId: expectedChainId, network } = this.config.chain;
    const startedAt = performance.now();
    try {
      const head = await this.chain.readHead();
      const details = {
        networkName: network.name,
        chainId: head.chainId,
        latestBlock: head.latestBlock,
        finalizedBlock: head.finalizedBlock,
        finalityLagBlocks:
          head.finalizedBlock === null ? null : Math.max(0, head.latestBlock - head.finalizedBlock),
        rpcEndpoint: head.endpoint,
      };
      if (head.chainId !== expectedChainId) {
        return {
          status: 'down',
          latencyMs: elapsedSince(startedAt),
          details,
          error: `RPC trả về chain ${head.chainId}, cấu hình là ${expectedChainId}`,
        };
      }
      return {
        // Đang chạy bằng RPC dự phòng: vẫn phục vụ được nhưng cần xử lý RPC chính.
        status: head.endpoint === 'primary' ? 'up' : 'degraded',
        latencyMs: elapsedSince(startedAt),
        details,
      };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: elapsedSince(startedAt),
        details: { networkName: network.name, chainId: expectedChainId },
        error: describeError(error),
      };
    }
  }
}
