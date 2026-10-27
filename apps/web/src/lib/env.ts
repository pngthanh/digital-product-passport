import { z } from 'zod';

const publicEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url().default('http://localhost:4000/api/v1'),
  NEXT_PUBLIC_CHAIN_ID: z.coerce.number().int().positive().default(10143),
});

/** Biến công khai (được nhúng vào bundle trình duyệt). Phải tham chiếu nguyên văn để Next.js thay thế. */
export const publicEnv = publicEnvSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || undefined,
  NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID || undefined,
});

/** Địa chỉ API dùng trong Server Component; có thể khác địa chỉ trình duyệt khi chạy trong Docker. */
export function serverApiUrl(): string {
  return process.env.API_INTERNAL_URL || publicEnv.NEXT_PUBLIC_API_URL;
}
