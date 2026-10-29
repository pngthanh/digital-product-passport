// Xoá sản phẩm và dữ liệu đi kèm (custody, ownership, bảo hành, cảnh báo) khỏi CSDL, giữ nguyên tài
// khoản, ví, doanh nghiệp và nhật ký. Dùng khi deploy ProductPassport mới (M6) mà sản phẩm test cũ
// thuộc contract trước. Event thô (blockchain_events) và audit_logs được giữ làm hồ sơ.
// Dùng: pnpm --filter @dpp/api products:reset            (xem số dòng sẽ xoá)
//       pnpm --filter @dpp/api products:reset --yes      (xoá thật)
import { config } from 'dotenv';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const confirmed = process.argv.slice(2).includes('--yes');
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  process.stderr.write('Thiếu DATABASE_URL trong .env\n');
  process.exit(1);
}

// Bảng con trước, products sau cùng (khoá ngoại ON DELETE RESTRICT).
const TABLES = [
  ['warranties', 'bảo hành'],
  ['ownership_records', 'lịch sử chủ sở hữu'],
  ['custody_records', 'lịch sử bên giữ hàng'],
  ['service_records', 'ghi nhận dịch vụ'],
  ['service_requests', 'yêu cầu dịch vụ'],
  ['transfer_requests', 'yêu cầu chuyển nhượng'],
  ['inspections', 'kiểm định'],
  ['recalls', 'thu hồi'],
  ['products', 'sản phẩm'],
];

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const counts = [];
  for (const [table, label] of TABLES) {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${table}`);
    counts.push([table, label, rows[0].n]);
  }
  const { rows: alerts } = await client.query(
    'SELECT count(*)::int AS n FROM anomaly_alerts WHERE product_id IS NOT NULL',
  );
  const summary = [
    ...counts.map(
      ([table, label, n]) => `  ${table.padEnd(18)} ${String(n).padStart(5)}  ${label}`,
    ),
    `  ${'anomaly_alerts'.padEnd(18)} ${String(alerts[0].n).padStart(5)}  cảnh báo gắn với sản phẩm`,
  ].join('\n');

  if (!confirmed) {
    process.stdout.write(
      `Sẽ xoá (tài khoản, ví, doanh nghiệp, nhật ký giữ nguyên):\n${summary}\n\n` +
        'Chạy lại kèm --yes để xoá: pnpm --filter @dpp/api products:reset --yes\n',
    );
  } else {
    await client.query('BEGIN');
    await client.query('DELETE FROM anomaly_alerts WHERE product_id IS NOT NULL');
    await client.query(
      'UPDATE blockchain_events SET product_id = NULL WHERE product_id IS NOT NULL',
    );
    for (const [table] of TABLES) {
      await client.query(`DELETE FROM ${table}`);
    }
    await client.query('COMMIT');
    process.stdout.write(
      `Đã xoá:\n${summary}\n\nGiờ nhập lại sản phẩm (CSV) trên web với ProductPassport mới.\n`,
    );
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
