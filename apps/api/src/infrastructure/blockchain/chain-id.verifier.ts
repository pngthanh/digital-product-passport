import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import { ChainProviderService } from './chain-provider.service.js';

export class ChainMismatchError extends Error {
  constructor(expected: number, actual: number) {
    super(
      `RPC đang trỏ tới chain ${actual}, nhưng cấu hình CHAIN_ID=${expected}. Dừng để tránh ghi nhầm mạng.`,
    );
    this.name = 'ChainMismatchError';
  }
}

/**
 * Kiểm tra chain ID khi khởi động. Sai mạng thì dừng tiến trình;
 * RPC chưa liên lạc được thì chỉ cảnh báo, trạng thái chi tiết xem ở /health/ready.
 */
@Injectable()
export class ChainIdVerifier implements OnApplicationBootstrap {
  private readonly logger = new Logger(ChainIdVerifier.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly chain: ChainProviderService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const expected = this.config.chain.chainId;
    let actual: number;
    try {
      actual = await this.chain.readChainId();
    } catch (error) {
      this.logger.warn(
        `Chưa kết nối được RPC: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    if (actual !== expected) {
      throw new ChainMismatchError(expected, actual);
    }
    this.logger.log(`Đã kết nối ${this.config.chain.network.name} (chain ${actual})`);
  }
}
