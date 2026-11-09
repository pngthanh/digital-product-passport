import { resolve } from 'node:path';
import { type ChainNetwork, getNetwork } from '@dpp/shared';
import { Injectable, type LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema.js';

export interface SessionConfig {
  readonly jwtSecret: string;
  readonly ttlMinutes: number;
  /** Cookie chỉ gửi qua HTTPS khi web chạy HTTPS. */
  readonly secureCookie: boolean;
  readonly authRateLimitPerMinute: number;
}

/** Cấu hình PartyRegistry; `null` khi chưa deploy hoặc chưa khai báo khoá ký giấy phép. */
export interface IdentityChainConfig {
  readonly registrarPrivateKey: string;
  readonly partyRegistryAddress: string;
}

/** Cấu hình ServiceTicketManager (M7). */
export interface ServiceChainConfig {
  readonly registrarPrivateKey: string;
  readonly serviceTicketManagerAddress: string;
}

/** Cấu hình InspectionRegistry (M8). */
export interface InspectionChainConfig {
  readonly registrarPrivateKey: string;
  readonly inspectionRegistryAddress: string;
}

/** Cấu hình ProductPassport (M5). */
export interface ProductChainConfig {
  readonly registrarPrivateKey: string;
  readonly productPassportAddress: string;
}

export interface IndexerConfig {
  readonly pollIntervalMs: number;
  /** Số block tối đa mỗi lần gọi eth_getLogs. */
  readonly blockRange: number;
  readonly reconcileIntervalMs: number;
}

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

  get session(): SessionConfig {
    return {
      jwtSecret: this.config.get('JWT_SECRET', { infer: true }),
      ttlMinutes: this.config.get('SESSION_TTL_MINUTES', { infer: true }),
      secureCookie: new URL(this.webOrigin).protocol === 'https:',
      authRateLimitPerMinute: this.config.get('AUTH_RATE_LIMIT_PER_MINUTE', { infer: true }),
    };
  }

  /** Địa chỉ PartyRegistry đã deploy; `null` nếu chưa khai báo. */
  get partyRegistryAddress(): string | null {
    return this.config.get('PARTY_REGISTRY_ADDRESS', { infer: true }) ?? null;
  }

  /** Block lúc deploy PartyRegistry; `null` nếu chưa khai báo. */
  get partyRegistryDeployBlock(): bigint | null {
    const block = this.config.get('PARTY_REGISTRY_DEPLOY_BLOCK', { infer: true });
    return block === undefined ? null : BigInt(block);
  }

  get productPassportAddress(): string | null {
    return this.config.get('PRODUCT_PASSPORT_ADDRESS', { infer: true }) ?? null;
  }

  /** Block lúc deploy ProductPassport; `null` nếu chưa khai báo. */
  get productPassportDeployBlock(): bigint | null {
    const block = this.config.get('PRODUCT_PASSPORT_DEPLOY_BLOCK', { infer: true });
    return block === undefined ? null : BigInt(block);
  }

  /** WarrantyManager (M6), deploy cùng ProductPassport nên dùng chung block bắt đầu quét. */
  get warrantyManagerAddress(): string | null {
    return this.config.get('WARRANTY_MANAGER_ADDRESS', { infer: true }) ?? null;
  }

  get serviceTicketManagerAddress(): string | null {
    return this.config.get('SERVICE_TICKET_MANAGER_ADDRESS', { infer: true }) ?? null;
  }

  /** Block lúc deploy ServiceTicketManager; `null` nếu chưa khai báo. */
  get serviceTicketManagerDeployBlock(): bigint | null {
    const block = this.config.get('SERVICE_TICKET_MANAGER_DEPLOY_BLOCK', { infer: true });
    return block === undefined ? null : BigInt(block);
  }

  /** ServiceTicketManager cùng khoá registrar ký giấy phép mở phiếu; `null` khi thiếu một trong hai. */
  get serviceChain(): ServiceChainConfig | null {
    const registrarPrivateKey = this.config.get('REGISTRAR_SIGNER_PRIVATE_KEY', { infer: true });
    const serviceTicketManagerAddress = this.serviceTicketManagerAddress;
    return registrarPrivateKey && serviceTicketManagerAddress
      ? { registrarPrivateKey, serviceTicketManagerAddress }
      : null;
  }

  get inspectionRegistryAddress(): string | null {
    return this.config.get('INSPECTION_REGISTRY_ADDRESS', { infer: true }) ?? null;
  }

  /** Block lúc deploy InspectionRegistry; `null` nếu chưa khai báo. */
  get inspectionRegistryDeployBlock(): bigint | null {
    const block = this.config.get('INSPECTION_REGISTRY_DEPLOY_BLOCK', { infer: true });
    return block === undefined ? null : BigInt(block);
  }

  /** InspectionRegistry cùng khoá registrar ký giấy phép ghi kết quả; `null` khi thiếu một trong hai. */
  get inspectionChain(): InspectionChainConfig | null {
    const registrarPrivateKey = this.config.get('REGISTRAR_SIGNER_PRIVATE_KEY', { infer: true });
    const inspectionRegistryAddress = this.inspectionRegistryAddress;
    return registrarPrivateKey && inspectionRegistryAddress
      ? { registrarPrivateKey, inspectionRegistryAddress }
      : null;
  }

  /** Thư mục tuyệt đối lưu file biên bản sửa chữa, kiểm định. */
  get uploadDir(): string {
    return resolve(this.config.get('UPLOAD_DIR', { infer: true }));
  }

  /** ProductPassport cùng khoá registrar ký giấy phép đăng ký sản phẩm; `null` khi thiếu một trong hai. */
  get productChain(): ProductChainConfig | null {
    const registrarPrivateKey = this.config.get('REGISTRAR_SIGNER_PRIVATE_KEY', { infer: true });
    const productPassportAddress = this.config.get('PRODUCT_PASSPORT_ADDRESS', { infer: true });
    return registrarPrivateKey && productPassportAddress
      ? { registrarPrivateKey, productPassportAddress }
      : null;
  }

  get indexer(): IndexerConfig {
    return {
      pollIntervalMs: this.config.get('INDEXER_POLL_INTERVAL_MS', { infer: true }),
      blockRange: this.config.get('INDEXER_BLOCK_RANGE', { infer: true }),
      reconcileIntervalMs: this.config.get('RECONCILE_INTERVAL_MINUTES', { infer: true }) * 60_000,
    };
  }

  get identityChain(): IdentityChainConfig | null {
    const registrarPrivateKey = this.config.get('REGISTRAR_SIGNER_PRIVATE_KEY', { infer: true });
    const partyRegistryAddress = this.config.get('PARTY_REGISTRY_ADDRESS', { infer: true });
    return registrarPrivateKey && partyRegistryAddress
      ? { registrarPrivateKey, partyRegistryAddress }
      : null;
  }
}
