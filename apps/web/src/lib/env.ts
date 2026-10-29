import { z } from 'zod';

/** Đường dẫn API phía trình duyệt: cùng origin, Next.js chuyển tiếp (xem next.config.ts). */
export const BROWSER_API_BASE = '/api/v1';

/** Địa chỉ API dùng trong Server Component; khác địa chỉ trình duyệt khi chạy trong Docker. */
export function serverApiUrl(): string {
  return (process.env.API_INTERNAL_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '');
}

const chainIdSchema = z.coerce.number().int().positive().default(10143);

/**
 * Chain mà hệ thống đang chạy, đọc từ CHAIN_ID (cùng biến với API) lúc xử lý request trên server.
 * Không dùng biến NEXT_PUBLIC_* vì giá trị đó bị nhúng cố định lúc build, dễ lệch với API.
 * Client Component nhận giá trị này qua props.
 */
export function serverChainId(): number {
  return chainIdSchema.parse(process.env.CHAIN_ID || undefined);
}
