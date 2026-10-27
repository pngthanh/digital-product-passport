import { type ChainNetwork, getNetwork } from '@dpp/shared';
import { Injectable, type LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema.js';

export interface ChainConfig {
  readonly chainId: number;
  readonly network: ChainNetwork;
  readonly rpcUrls: readonly string[];
  readonly timeoutMs: number;
}

const LOG_LEVEL_ORDER: readonly LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];

/** Truy cập cấu hình đã kiểm tra, có kiểu rõ ràng — không đọc `process.env` rải rác. */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get nodeEnv(): Env['NODE_ENV'] {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  /** Các mức log được bật, từ `error` tới mức cấu hình. */
  get logLevels(): LogLevel[] {
    const level = this.config.get('LOG_LEVEL', { infer: true });
    return LOG_LEVEL_ORDER.slice(0, LOG_LEVEL_ORDER.indexOf(level) + 1);
  }

  get apiPort(): number {
    return this.config.get('API_PORT', { infer: true });
  }

  get webOrigin(): string {
    return this.config.get('WEB_ORIGIN', { infer: true });
  }

  get databaseUrl(): string {
    return this.config.get('DATABASE_URL', { infer: true });
  }

  get chain(): ChainConfig {
    const chainId = this.config.get('CHAIN_ID', { infer: true });
    const fallbackUrl = this.config.get('RPC_FALLBACK_URL', { infer: true });
    const network = getNetwork(chainId);
    if (!network) {
      throw new Error(`CHAIN_ID ${chainId} chưa được hỗ trợ`);
    }
    return {
      chainId,
      network,
      rpcUrls: fallbackUrl
        ? [this.config.get('RPC_URL', { infer: true }), fallbackUrl]
        : [this.config.get('RPC_URL', { infer: true })],
      timeoutMs: this.config.get('RPC_TIMEOUT_MS', { infer: true }),
    };
  }
}
