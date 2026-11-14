import { NextResponse, type NextRequest } from 'next/server';

/**
 * (M11) Next.js chuyển tiếp /api/v1 sang API (next.config.ts) nhưng không tự gửi kèm IP người
 * dùng. Đặt lại header của request ở đây thì X-Forwarded-For mà Next.js đã ghi đi theo sang API,
 * để API giới hạn tra cứu công khai và đăng nhập theo từng IP thay vì gộp mọi người vào một.
 * Khi chạy thật sau Nginx/Caddy, proxy đó phải ghi đè X-Forwarded-For bằng IP thật của người dùng.
 */
export function proxy(request: NextRequest) {
  return NextResponse.next({ request: { headers: new Headers(request.headers) } });
}

export const config = {
  matcher: ['/api/v1/public/:path*', '/api/v1/auth/:path*'],
};
