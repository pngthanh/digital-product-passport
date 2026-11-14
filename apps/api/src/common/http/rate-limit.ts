import { applyDecorators, type ExecutionContext, UseGuards } from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

export const RATE_LIMIT_WINDOW_MS = 60_000;

/** Throttler mặc định: đăng ký, đăng nhập (đếm riêng từng đường dẫn, chống dò mật khẩu). */
export const AUTH_THROTTLER = 'default';
/** (M11) Throttler của trang công khai: mọi đường dẫn /public/* dùng chung một bộ đếm mỗi IP. */
export const PUBLIC_THROTTLER = 'public';

const AUTH_LIMIT_MESSAGE = 'Bạn thử quá nhiều lần. Đợi một phút rồi thử lại.';
const PUBLIC_LIMIT_MESSAGE = 'Bạn tra cứu quá nhiều lần trong một phút. Đợi một chút rồi thử lại.';

/** Khoá đếm của throttler công khai: theo IP, không theo đường dẫn. */
export function publicThrottlerKey(_context: ExecutionContext, tracker: string, name: string) {
  return `${name}-${tracker}`;
}

/** Thông báo 429 theo nhóm đường dẫn. */
export function rateLimitMessage(context: ExecutionContext): string {
  const request = context.switchToHttp().getRequest<Request>();
  return request.path.includes('/public/') ? PUBLIC_LIMIT_MESSAGE : AUTH_LIMIT_MESSAGE;
}

/** Đăng ký, đăng nhập: chỉ throttler mặc định. */
export function AuthRateLimit() {
  return applyDecorators(UseGuards(ThrottlerGuard), SkipThrottle({ [PUBLIC_THROTTLER]: true }));
}

/**
 * (M11) Đường dẫn công khai không cần đăng nhập: giới hạn chung theo IP (lấy từ X-Forwarded-For do
 * web chuyển tiếp, xem `trust proxy` trong configure-http-app.ts), chống dò mã QR và dội RPC.
 */
export function PublicRateLimit() {
  return applyDecorators(UseGuards(ThrottlerGuard), SkipThrottle({ [AUTH_THROTTLER]: true }));
}
