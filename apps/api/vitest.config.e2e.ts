import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup-e2e.ts'],
    // Các test dùng chung một CSDL thật nên chạy tuần tự.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
