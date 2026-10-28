import type { ApiErrorBody } from '@dpp/shared';

/** Lỗi API đã chuẩn hoá: `code` cho nghiệp vụ, `fieldErrors` cho lỗi kiểm tra dữ liệu từng ô. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | null,
    readonly fieldErrors: Readonly<Record<string, string>>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const FALLBACK_MESSAGE = 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';

function isErrorBody(
  value: unknown,
): value is Pick<ApiErrorBody, 'message'> & Partial<ApiErrorBody> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
  );
}

/** Đọc thân lỗi của API (định dạng ErrorResponseBody); không tin dữ liệu mạng. */
export function toApiError(status: number, body: unknown): ApiError {
  if (!isErrorBody(body)) {
    return new ApiError(status, FALLBACK_MESSAGE, null, {});
  }
  const fieldErrors: Record<string, string> = {};
  if (Array.isArray(body.details)) {
    for (const issue of body.details) {
      if (
        typeof issue === 'object' &&
        issue !== null &&
        'path' in issue &&
        'message' in issue &&
        typeof issue.path === 'string' &&
        typeof issue.message === 'string'
      ) {
        fieldErrors[issue.path] ??= issue.message;
      }
    }
  }
  return new ApiError(
    status,
    body.message,
    typeof body.code === 'string' ? body.code : null,
    fieldErrors,
  );
}

export function networkError(): ApiError {
  return new ApiError(0, FALLBACK_MESSAGE, null, {});
}
