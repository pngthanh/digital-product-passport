import '../src/config/load-env-file.js';

// Test e2e luôn chạy trên CSDL riêng để không đụng dữ liệu phát triển.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    'Thiếu TEST_DATABASE_URL trong .env. Tạo CSDL test (docker compose tự tạo dpp_test) rồi chạy `pnpm --filter @dpp/api db:deploy:test`.',
  );
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
// Test gọi đăng nhập liên tục từ cùng một IP; giới hạn tần suất được kiểm tra riêng.
process.env.AUTH_RATE_LIMIT_PER_MINUTE = '10000';
process.env.JWT_SECRET ||= 'e2e-only-secret-that-is-long-enough-0123456789';
