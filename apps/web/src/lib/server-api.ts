import 'server-only';
import { cookies } from 'next/headers';
import type { ZodType } from 'zod';
import { serverApiUrl } from './env';

const REQUEST_TIMEOUT_MS = 8000;

/**
 * Gọi API từ Server Component, kèm cookie phiên của request hiện tại.
 * Trả `null` khi chưa đăng nhập, không có quyền, API không trả lời hoặc dữ liệu sai định dạng.
 */
export async function serverGet<T>(path: `/${string}`, schema: ZodType<T>): Promise<T | null> {
  const cookieHeader = (await cookies()).toString();
  try {
    const response = await fetch(`${serverApiUrl()}${path}`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    const parsed = schema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
