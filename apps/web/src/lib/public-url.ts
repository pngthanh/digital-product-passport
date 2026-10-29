import 'server-only';
import { headers } from 'next/headers';

/**
 * Địa chỉ web in trong mã QR. Mặc định là địa chỉ người dùng đang mở (localhost khi chạy máy cá nhân);
 * đặt PUBLIC_WEB_URL (ví dụ http://192.168.1.10:3000) để điện thoại cùng mạng Wi-Fi quét được.
 */
export async function publicWebUrl(): Promise<string> {
  const configured = process.env.PUBLIC_WEB_URL?.trim();
  if (configured && /^https?:\/\/[^\s/]+/.test(configured)) {
    return configured.replace(/\/+$/, '');
  }
  const requestHeaders = await headers();
  const host =
    requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? 'localhost:3000';
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http';
  return `${protocol}://${host}`;
}
