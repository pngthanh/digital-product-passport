import '../src/config/load-env-file.js';

// Test e2e luôn chạy trên CSDL riêng để không đụng dữ liệu phát triển.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    'Thiếu TEST_DATABASE_URL trong .env. Tạo CSDL test (docker compose tự tạo dpp_test) rồi chạy `pnpm --filter @dpp/api db:deploy:test`.',
  );
}

/*
 * Mỗi test tự dựng Hardhat node và cấu hình chain riêng. ConfigService của NestJS lấy biến thiếu trong
 * cấu hình test từ process.env, nên phải bỏ cấu hình chain của .env (ví dụ địa chỉ contract trên Monad),
 * nếu không Worker trong test sẽ quét contract không có trên Hardhat node. Giữ giống môi trường CI.
 */
const CHAIN_ENV =
  /^(CHAIN_ID|RPC_|REGISTRAR_|INDEXER_|RECONCILE_|ANOMALY_)|_(ADDRESS|DEPLOY_BLOCK)$/;
for (const key of Object.keys(process.env)) {
  if (CHAIN_ENV.test(key)) {
    delete process.env[key];
  }
}
process.env.CHAIN_ID = '31337';
process.env.RPC_URL = 'http://127.0.0.1:8545';

process.env.DATABASE_URL = testDatabaseUrl;
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
// Test gọi đăng nhập liên tục từ cùng một IP; giới hạn tần suất được kiểm tra riêng.
process.env.AUTH_RATE_LIMIT_PER_MINUTE = '10000';
process.env.PUBLIC_RATE_LIMIT_PER_MINUTE = '10000';
process.env.JWT_SECRET ||= 'e2e-only-secret-that-is-long-enough-0123456789';
