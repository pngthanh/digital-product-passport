// Cấp hoặc thu quyền Admin cho một tài khoản đã đăng ký.
// Dùng: pnpm --filter @dpp/api admin:grant <email>   |   pnpm --filter @dpp/api admin:revoke <email>
import { config } from 'dotenv';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const [action, rawEmail] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();
if (!['grant', 'revoke'].includes(action) || !email) {
  process.stderr.write('Dùng: node scripts/grant-admin.mjs grant|revoke <email>\n');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  process.stderr.write('Thiếu DATABASE_URL trong .env\n');
  process.exit(1);
}

const role = action === 'grant' ? 'ADMIN' : 'USER';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const { rows } = await client.query(
    'UPDATE users SET system_role = $1, updated_at = now() WHERE email = $2 RETURNING full_name',
    [role, email],
  );
  if (rows.length === 0) {
    process.stderr.write(`Không có tài khoản ${email}. Đăng ký trên web trước rồi chạy lại.\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      action === 'grant'
        ? `Đã cấp quyền Admin cho ${rows[0].full_name} (${email}).\n` +
            'Tài khoản này cần liên kết đúng ví MetaMask đã deploy PartyRegistry để ký duyệt.\n'
        : `Đã thu quyền Admin của ${rows[0].full_name} (${email}).\n`,
    );
  }
} finally {
  await client.end();
}
