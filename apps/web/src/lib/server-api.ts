import 'server-only';
import { cookies, headers } from 'next/headers';
import type { ZodType } from 'zod';
import { serverApiUrl } from './env';

const REQUEST_TIMEOUT_MS = 8000;
const FORWARDED_FOR = 'x-forwarded-for';

/** Kết quả gọi API kèm mã HTTP, để trang phân biệt "không có" (404) với "quá giới hạn" (429). */
export type ServerResult<T> = { ok: true; data: T } | { ok: false; status: number | null };

/**
 * Cookie phiên và IP người xem (M11): API giới hạn tra cứu công khai theo IP, mà request này đi từ
 * máy chủ web nên phải chuyển tiếp X-Forwarded-For Next.js đã ghi cho request gốc.
 */
async function forwardedHeaders(): Promise<Record<string, string>> {
  const [cookieStore, incoming] = await Promise.all([cookies(), headers()]);
  const forwardedFor = incoming.get(FORWARDED_FOR);
  return {
    cookie: cookieStore.toString(),
    ...(forwardedFor ? { [FORWARDED_FOR]: forwardedFor } : {}),
  };
}

/** Gọi API từ Server Component; trả mã HTTP khi lỗi, `status: null` khi API không trả lời hoặc sai định dạng. */
export async function serverFetch<T>(
  path: `/${string}`,
  schema: ZodType<T>,
): Promise<ServerResult<T>> {
  try {
    const response = await fetch(`${serverApiUrl()}${path}`, {
      headers: await forwardedHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, status: response.status };
    }
    const parsed = schema.safeParse(await response.json());
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, status: null };
  } catch {
    return { ok: false, status: null };
  }
}

/**
 * Gọi API từ Server Component, kèm cookie phiên của request hiện tại.
 * Trả `null` khi chưa đăng nhập, không có quyền, API không trả lời hoặc dữ liệu sai định dạng.
 */
export async function serverGet<T>(path: `/${string}`, schema: ZodType<T>): Promise<T | null> {
  const result = await serverFetch(path, schema);
  return result.ok ? result.data : null;
}
