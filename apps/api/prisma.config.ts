import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

// Một file .env duy nhất ở gốc monorepo.
loadEnv({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // PRISMA_DATABASE=test: áp migration vào CSDL test (xem script db:deploy:test).
    url:
      process.env.PRISMA_DATABASE === 'test'
        ? process.env.TEST_DATABASE_URL
        : process.env.DATABASE_URL,
  },
});
