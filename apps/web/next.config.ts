import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import path from 'node:path';

// Dùng chung file .env ở gốc monorepo (pnpm chạy script trong thư mục apps/web).
// Next.js đã nạp (và cache) env của apps/web trước khi đọc file này, nên phải ép nạp lại
// (forceReload) thì biến NEXT_PUBLIC_* trong .env gốc mới được nhúng vào bundle.
loadEnvConfig(
  path.resolve(process.cwd(), '../..'),
  process.env.NODE_ENV !== 'production',
  console,
  true,
);

const apiInternalUrl = (process.env.API_INTERNAL_URL || 'http://localhost:4000/api/v1').replace(
  /\/$/,
  '',
);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  // Trình duyệt gọi /api/v1 trên chính origin của web; Next.js chuyển tiếp sang API.
  // Cookie phiên vì vậy là cookie first-party, không cần CORS kèm credentials.
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiInternalUrl}/:path*` }];
  },
};

export default nextConfig;
