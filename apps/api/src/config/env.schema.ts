import { getNetwork } from '@dpp/shared';
import { z } from 'zod';

/** Chuỗi rỗng trong .env được hiểu là "không khai báo". */
const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

const optionalUrl = z.preprocess(emptyAsUndefined, z.url({ protocol: /^https?$/ }).optional());

const optionalPrivateKey = z.preprocess(
  emptyAsUndefined,
  z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, 'phải là khoá riêng dạng 0x + 64 ký tự hex')
    .optional(),
);

const optionalAddress = z.preprocess(
  emptyAsUndefined,
  z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'phải là địa chỉ EVM dạng 0x + 40 ký tự hex')
    .optional(),
);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),

  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),

  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL phải là chuỗi kết nối PostgreSQL'),

  CHAIN_ID: z.coerce
    .number()
    .int()
    .refine((chainId) => getNetwork(chainId) !== undefined, {
      message:
        'CHAIN_ID chưa được hỗ trợ (dùng 10143 cho Monad Testnet hoặc 31337 cho Hardhat local)',
    })
    .default(10143),
  RPC_URL: z.url({ protocol: /^https?$/ }),
  RPC_FALLBACK_URL: optionalUrl,
  RPC_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(5000),

  JWT_SECRET: z
    .string()
    .min(32, 'cần ít nhất 32 ký tự ngẫu nhiên (tạo bằng: pnpm --filter @dpp/api secret:new)'),
  SESSION_TTL_MINUTES: z.coerce.number().int().min(5).max(43_200).default(720),
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(10),

  // Để trống thì API vẫn chạy, chỉ phần liên kết ví (ACC-03/04) báo "chưa cấu hình".
  REGISTRAR_SIGNER_PRIVATE_KEY: optionalPrivateKey,
  PARTY_REGISTRY_ADDRESS: optionalAddress,
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Cấu hình môi trường không hợp lệ:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'EnvValidationError';
  }
}

/** Kiểm tra biến môi trường khi khởi động; sai cấu hình thì dừng ngay, không chạy nửa vời. */
export function parseEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}
