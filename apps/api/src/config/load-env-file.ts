import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';

/*
 * Nạp file .env duy nhất ở gốc monorepo. Import file này đầu tiên trong main.ts/worker.ts.
 * Biến môi trường đã có sẵn (CI, Docker) được ưu tiên và không bị ghi đè.
 */
loadEnv({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });
