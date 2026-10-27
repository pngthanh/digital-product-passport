import type { HealthDetailValue } from '@dpp/shared';
import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { Panel } from '@/components/ui/panel';
import {
  ComponentStatus,
  type DetailField,
  HEALTH_STATUS_LABELS,
} from '@/features/system-status/component-status';
import { getReadiness } from '@/features/system-status/get-readiness';
import { RefreshButton } from '@/features/system-status/refresh-button';
import { formatNumber, formatTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Trạng thái hệ thống' };

// Luôn kiểm tra lúc người dùng mở trang, không dựng sẵn khi build.
export const dynamic = 'force-dynamic';

const DATABASE_FIELDS: readonly DetailField[] = [
  { key: 'serverVersion', label: 'Phiên bản PostgreSQL' },
  { key: 'database', label: 'Tên CSDL' },
];

const formatBlocks = (value: HealthDetailValue) =>
  typeof value === 'number' ? `${formatNumber(value)} block` : 'Không có';

const CHAIN_FIELDS: readonly DetailField[] = [
  { key: 'networkName', label: 'Mạng' },
  { key: 'chainId', label: 'Chain ID', format: (value) => String(value) },
  {
    key: 'rpcEndpoint',
    label: 'RPC đang dùng',
    format: (value) => (value === 'primary' ? 'Chính' : 'Dự phòng'),
  },
  { key: 'latestBlock', label: 'Block mới nhất' },
  { key: 'finalizedBlock', label: 'Block đã finalized' },
  { key: 'finalityLagBlocks', label: 'Chờ finalized', format: formatBlocks },
];

export default async function SystemStatusPage() {
  const result = await getReadiness();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Trạng thái hệ thống</h1>
          <p className="mt-2 text-muted">
            {result.kind === 'reported'
              ? `Kiểm tra lúc ${formatTime(result.report.checkedAt)}`
              : 'Chưa nhận được báo cáo từ API'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {result.kind === 'reported' ? (
            <Badge tone={HEALTH_STATUS_LABELS[result.report.status].tone} dot>
              {HEALTH_STATUS_LABELS[result.report.status].label}
            </Badge>
          ) : null}
          <RefreshButton />
        </div>
      </div>

      {result.kind === 'reported' ? (
        <Panel className="mt-8 divide-y divide-line">
          <ComponentStatus
            name="Cơ sở dữ liệu"
            description="PostgreSQL lưu hồ sơ off-chain và bản chiếu từ blockchain."
            health={result.report.components.database}
            fields={DATABASE_FIELDS}
          />
          <ComponentStatus
            name="Blockchain"
            description="Nút RPC dùng để gửi giao dịch và đọc event. Block finalized thì không thể đảo ngược."
            health={result.report.components.chain}
            fields={CHAIN_FIELDS}
          />
        </Panel>
      ) : (
        <Panel className="mt-8 px-5 py-6">
          <h2 className="font-medium text-bad">Không kết nối được API</h2>
          <p className="mt-2 text-muted">
            Web đã gọi{' '}
            <code className="font-mono text-[13px] text-ink">{result.apiUrl}/health/ready</code>{' '}
            nhưng không nhận được báo cáo hợp lệ.
          </p>
          <p className="mt-3 rounded-control bg-bad-tint px-3 py-2 font-mono text-[13px] break-words text-bad">
            {result.reason}
          </p>
          <p className="mt-4 text-sm text-muted">
            Chạy <code className="font-mono text-[13px] text-ink">pnpm dev</code> ở thư mục gốc,
            hoặc kiểm tra <code className="font-mono text-[13px] text-ink">API_INTERNAL_URL</code>{' '}
            trong file .env.
          </p>
        </Panel>
      )}
    </div>
  );
}
