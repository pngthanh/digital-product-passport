// M13: đường cơ sở tập trung để so với blockchain. Cùng các việc "ghi hồ sơ", "đổi trạng thái kèm
// nhật ký" và "đọc rồi kiểm chữ ký", nhưng lưu trong PostgreSQL và ký bằng ECDSA secp256k1 (khoá do
// máy chủ giữ), không có blockchain. Chạy trong schema riêng `bench_baseline`, xoá khi xong; không
// đụng bảng của hệ thống.
// Dùng: pnpm --filter @dpp/api bench:baseline   (biến tuỳ chọn BENCH_RUNS=20, BASELINE_THROUGHPUT=1000)
import { config } from 'dotenv';
import { id, keccak256, recoverAddress, toUtf8Bytes, Wallet } from 'ethers';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

if (!process.env.DATABASE_URL) {
  process.stderr.write('Thiếu DATABASE_URL trong .env\n');
  process.exit(1);
}

function intEnv(name, fallback, max) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} phải là số nguyên từ 1 đến ${max}`);
  }
  return value;
}

const RUNS = intEnv('BENCH_RUNS', 20, 1000);
const THROUGHPUT = intEnv('BASELINE_THROUGHPUT', 1000, 100_000);
const BATCH = intEnv('BENCH_BATCH', 20, 50);
const SCHEMA = 'bench_baseline';

/** Khoá ký của máy chủ (thay cho chữ ký on-chain); tạo mới mỗi lần chạy. */
const signer = Wallet.createRandom();

function digestOf(record) {
  return keccak256(toUtf8Bytes(JSON.stringify(record)));
}

function sign(record) {
  return signer.signingKey.sign(digestOf(record)).serialized;
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const samples = new Map();
function record(operation, ms) {
  const list = samples.get(operation) ?? [];
  list.push(ms);
  samples.set(operation, list);
}

async function timed(operation, action) {
  const started = performance.now();
  const result = await action();
  record(operation, performance.now() - started);
  return result;
}

async function writeProduct(serial) {
  const product = {
    serial,
    metadataHash: id(`ho so ${serial}`),
    warrantyMonths: 24,
    state: 'CREATED',
  };
  const signature = sign(product);
  await client.query('BEGIN');
  const { rows } = await client.query(
    `INSERT INTO ${SCHEMA}.products (serial, metadata_hash, warranty_months, state, signature)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [serial, product.metadataHash, product.warrantyMonths, product.state, signature],
  );
  await client.query(
    `INSERT INTO ${SCHEMA}.events (product_id, event_name, payload, signature) VALUES ($1, $2, $3, $4)`,
    [rows[0].id, 'ProductRegistered', JSON.stringify(product), signature],
  );
  await client.query('COMMIT');
  return rows[0].id;
}

async function changeState(productId, state) {
  const change = { productId, state, at: new Date().toISOString() };
  const signature = sign(change);
  await client.query('BEGIN');
  await client.query(
    `UPDATE ${SCHEMA}.products SET state = $2, signature = $3, updated_at = now() WHERE id = $1`,
    [productId, state, signature],
  );
  await client.query(
    `INSERT INTO ${SCHEMA}.events (product_id, event_name, payload, signature) VALUES ($1, $2, $3, $4)`,
    [productId, 'ProductStateChanged', JSON.stringify(change), signature],
  );
  await client.query('COMMIT');
}

async function readAndVerify(productId) {
  const { rows } = await client.query(
    `SELECT payload, signature FROM ${SCHEMA}.events WHERE product_id = $1 ORDER BY id`,
    [productId],
  );
  for (const row of rows) {
    if (recoverAddress(digestOf(JSON.parse(row.payload)), row.signature) !== signer.address) {
      throw new Error('Chữ ký không khớp');
    }
  }
  return rows.length;
}

function stats(values) {
  const sorted = values.toSorted((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.length > 1
      ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
      : 0;
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
  return {
    min: sorted[0],
    mean,
    p50: pick(0.5),
    p95: pick(0.95),
    max: sorted.at(-1),
    stddev: Math.sqrt(variance),
  };
}

let report;
try {
  await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await client.query(`CREATE SCHEMA ${SCHEMA}`);
  await client.query(`
    CREATE TABLE ${SCHEMA}.products (
      id bigserial PRIMARY KEY,
      serial text NOT NULL UNIQUE,
      metadata_hash char(66) NOT NULL,
      warranty_months int NOT NULL,
      state text NOT NULL,
      signature text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  await client.query(`
    CREATE TABLE ${SCHEMA}.events (
      id bigserial PRIMARY KEY,
      product_id bigint NOT NULL REFERENCES ${SCHEMA}.products(id),
      event_name text NOT NULL,
      payload text NOT NULL,
      signature text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await client.query(`CREATE INDEX ON ${SCHEMA}.events (product_id)`);

  // Khởi động: vài lần ghi để PostgreSQL và JIT của Node ổn định, không tính.
  for (let index = 0; index < 5; index += 1) {
    await changeState(await writeProduct(`WARMUP-${index}`), 'IN_DISTRIBUTION');
  }

  for (let round = 1; round <= RUNS; round += 1) {
    const serial = `BASE-${String(round).padStart(4, '0')}`;
    const productId = await timed('Ghi hồ sơ sản phẩm + ký (≈ registerProducts)', () =>
      writeProduct(serial),
    );
    for (const state of ['IN_DISTRIBUTION', 'AT_RETAIL', 'SOLD']) {
      await timed('Đổi trạng thái + ghi nhật ký + ký (≈ dispatch, nhận, bán)', () =>
        changeState(productId, state),
      );
    }
    await timed('Đọc nhật ký + kiểm mọi chữ ký (≈ tự kiểm hộ chiếu)', () =>
      readAndVerify(productId),
    );
  }

  // Lô BATCH sản phẩm trong một giao dịch CSDL.
  const batchStarted = performance.now();
  await client.query('BEGIN');
  for (let index = 1; index <= BATCH; index += 1) {
    const product = {
      serial: `BATCH-${index}`,
      metadataHash: id(`lo ${index}`),
      warrantyMonths: 24,
      state: 'CREATED',
    };
    await client.query(
      `INSERT INTO ${SCHEMA}.products (serial, metadata_hash, warranty_months, state, signature)
       VALUES ($1, $2, $3, $4, $5)`,
      [product.serial, product.metadataHash, product.warrantyMonths, product.state, sign(product)],
    );
  }
  await client.query('COMMIT');
  const batchMs = performance.now() - batchStarted;

  // Thông lượng: ghi tuần tự THROUGHPUT hồ sơ, mỗi hồ sơ một giao dịch CSDL.
  const throughputStarted = performance.now();
  for (let index = 1; index <= THROUGHPUT; index += 1) {
    await writeProduct(`TPS-${index}`);
  }
  const throughputMs = performance.now() - throughputStarted;

  const { rows: version } = await client.query('SHOW server_version');
  report = {
    generatedAt: new Date().toISOString(),
    postgres: version[0].server_version,
    node: process.version,
    runs: RUNS,
    operations: [...samples.entries()].map(([operation, values]) => ({
      operation,
      samples: values.length,
      ms: stats(values),
    })),
    batch: { size: BATCH, ms: batchMs },
    throughput: {
      records: THROUGHPUT,
      ms: throughputMs,
      perSecond: THROUGHPUT / (throughputMs / 1000),
    },
  };
} finally {
  await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).catch(() => undefined);
  await client.end();
}

const dec = (value, digits = 1) => value.toFixed(digits).replace('.', ',');
const markdown = [
  '# Đường cơ sở PostgreSQL + chữ ký ECDSA',
  '',
  `Sinh tự động bởi \`apps/api/scripts/benchmark-baseline.mjs\` lúc ${report.generatedAt}. PostgreSQL ${report.postgres}, Node ${report.node}. Mỗi việc chạy ${RUNS} lần (mỗi lần đổi trạng thái 3 bước) sau 5 lần khởi động. Ký và kiểm bằng ECDSA secp256k1 (khoá do máy chủ giữ), băm keccak256 giống blockchain. Không tốn phí giao dịch.`,
  '',
  '| Việc | n | TB (ms) | p50 (ms) | p95 (ms) | Lệch chuẩn (ms) |',
  '| --- | --: | --: | --: | --: | --: |',
  ...report.operations.map(
    (item) =>
      `| ${item.operation} | ${item.samples} | ${dec(item.ms.mean, 2)} | ${dec(item.ms.p50, 2)} | ${dec(item.ms.p95, 2)} | ${dec(item.ms.stddev, 2)} |`,
  ),
  '',
  `Lô ${BATCH} hồ sơ trong một giao dịch CSDL: ${dec(report.batch.ms, 1)} ms. Ghi tuần tự ${report.throughput.records.toLocaleString('vi-VN')} hồ sơ: ${dec(report.throughput.ms / 1000, 2)} giây (${dec(report.throughput.perSecond, 0)} hồ sơ/giây).`,
  '',
].join('\n');

const outputDir = fileURLToPath(new URL('../../../docs/benchmark/', import.meta.url));
await mkdir(outputDir, { recursive: true });
await writeFile(`${outputDir}postgres-baseline.json`, `${JSON.stringify(report, null, 2)}\n`);
await writeFile(`${outputDir}postgres-baseline.md`, markdown);
process.stdout.write(`Xong. Đã ghi docs/benchmark/postgres-baseline.md và .json.\n`);
