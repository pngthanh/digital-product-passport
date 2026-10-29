import type { ZodType } from 'zod';
import { ApiError, networkError, toApiError } from './api-error';
import { BROWSER_API_BASE } from './env';

type ApiPath = `/${string}`;

async function send(
  path: ApiPath,
  method: 'GET' | 'POST' | 'DELETE',
  body: unknown,
): Promise<Response> {
  try {
    return await fetch(`${BROWSER_API_BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw networkError();
  }
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

/**
 * Gọi API từ trình duyệt (cookie phiên tự đi kèm vì cùng origin) và kiểm tra dữ liệu trả về
 * bằng zod schema. Lỗi được ném dưới dạng ApiError.
 */
export async function apiRequest<T>(
  path: ApiPath,
  schema: ZodType<T>,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  const response = await send(path, options.method ?? 'GET', options.body);
  const body = await readJson(response);
  if (!response.ok) {
    throw toApiError(response.status, body);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(response.status, 'Máy chủ trả dữ liệu không đúng định dạng.', null, {});
  }
  return parsed.data;
}

/** Lệnh không cần dữ liệu trả về (ví dụ đăng xuất, trả 204). */
export async function apiCommand(path: ApiPath, body?: unknown): Promise<void> {
  const response = await send(path, 'POST', body);
  if (!response.ok) {
    throw toApiError(response.status, await readJson(response));
  }
}

export { ApiError };

/** Xoá một tài nguyên (API trả 204). */
export async function apiDelete(path: ApiPath): Promise<void> {
  const response = await send(path, 'DELETE', undefined);
  if (!response.ok) {
    throw toApiError(response.status, await readJson(response));
  }
}
