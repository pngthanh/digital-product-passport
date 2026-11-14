import { OrgType, ProductState, type DashboardStatistics } from '@dpp/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Panel } from '@/components/ui/panel';
import { requireAdmin } from '@/features/admin/admin-context';
import { ActivityChart } from '@/features/monitoring/activity-chart';
import { BarList, CountList, StatTile } from '@/features/monitoring/dashboard-parts';
import { dashboardSchema } from '@/features/monitoring/monitoring.schema';
import { RefreshButton } from '@/features/system-status/refresh-button';
import { formatDate, formatNumber, formatTime } from '@/lib/format';
import { serverGet } from '@/lib/server-api';
import {
  ORG_TYPE_LABELS,
  ORGANIZATION_STAGE_LABELS,
  PRODUCT_STATE_LABELS,
  WARRANTY_STATE_LABELS,
} from '@/lib/state-labels';

export const metadata: Metadata = { title: 'Tổng quan quản trị' };

export const dynamic = 'force-dynamic';

const STAGES = ['DRAFT', 'PENDING', 'AUTHORIZED', 'REJECTED', 'DISABLED'] as const;
const TX_STATUS_LABELS = {
  QUEUED: 'Đang chuẩn bị',
  SUBMITTED: 'Chờ chốt',
  CONFIRMED: 'Đã chốt',
  REVERTED: 'Bị revert',
  FAILED: 'Không vào block',
} as const;

function sum(values: Record<string, number>): number {
  return Object.values(values).reduce((total, value) => total + value, 0);
}

function SectionTitle({ id, title, note }: { id: string; title: string; note?: string }) {
  return (
    <div className="mb-4">
      <h2 id={id} className="font-semibold">
        {title}
      </h2>
      {note ? <p className="mt-0.5 text-sm text-muted">{note}</p> : null}
    </div>
  );
}

function IndexerPanel({ indexer }: { indexer: DashboardStatistics['indexer'] }) {
  const behind = indexer.behindBlocks === null ? null : BigInt(indexer.behindBlocks);
  return (
    <Panel className="px-5 py-5" aria-labelledby="indexer">
      <SectionTitle id="indexer" title="Indexer" note="So với block finalized của chain." />
      <p className="text-3xl font-semibold tracking-tight">
        {behind === null ? 'Không đọc được' : behind === 0n ? 'Bắt kịp' : `Chậm ${behind} block`}
      </p>
      <p className="mt-1 text-sm text-muted">
        {indexer.lastIndexedAt
          ? `Ghi mốc lần cuối ${formatTime(indexer.lastIndexedAt)} ${formatDate(indexer.lastIndexedAt)}`
          : 'Worker chưa quét lần nào'}
      </p>
      {behind === null ? (
        <p className="mt-3 rounded-control bg-warn-tint px-3 py-2 text-sm text-warn">
          RPC không trả lời nên chưa so được với chain.
        </p>
      ) : null}
      <Link
        href="/system/status"
        className="mt-4 inline-block text-sm font-medium text-tint-ink underline-offset-4 hover:underline"
      >
        Trạng thái hệ thống
      </Link>
    </Panel>
  );
}

export default async function AdminDashboardPage() {
  await requireAdmin();
  const stats = await serverGet('/admin/dashboard', dashboardSchema);

  if (!stats) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Tổng quan hệ thống</h1>
        <Panel className="mt-8 px-5 py-6">
          <p className="font-medium text-bad">Không tải được số liệu từ API.</p>
        </Panel>
      </div>
    );
  }

  const organizations = Object.values(OrgType);
  const approved = organizations.reduce(
    (total, type) => total + stats.organizations[type].AUTHORIZED,
    0,
  );
  const pendingOrganizations = organizations.reduce(
    (total, type) => total + stats.organizations[type].PENDING,
    0,
  );
  const onchainProducts = sum(stats.products.byState);
  const openAlerts = sum(stats.alerts);
  const txTotal = sum(stats.transactions.byStatus);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Tổng quan hệ thống</h1>
          <p className="mt-2 text-muted">
            Số liệu lúc {formatTime(stats.generatedAt)} {formatDate(stats.generatedAt)}. Trạng thái
            sản phẩm lấy theo event Indexer đã chốt.
          </p>
        </div>
        <RefreshButton label="Làm mới" pendingLabel="Đang tải…" />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label="Tài khoản"
          value={stats.accounts.total}
          sub={`${formatNumber(stats.accounts.withWallet)} đã liên kết ví · ${formatNumber(stats.accounts.admins)} Admin`}
        />
        <StatTile
          label="Doanh nghiệp đã duyệt"
          value={approved}
          href="/admin/organizations"
          tone={pendingOrganizations > 0 ? 'attention' : 'default'}
          sub={
            pendingOrganizations > 0
              ? `${formatNumber(pendingOrganizations)} đơn chờ duyệt`
              : 'Không có đơn chờ duyệt'
          }
        />
        <StatTile
          label="Sản phẩm trên chain"
          value={onchainProducts}
          sub={`${formatNumber(stats.products.drafts)} bản nháp chưa phát hành`}
        />
        <StatTile
          label="Cảnh báo đang mở"
          value={openAlerts}
          href="/admin/alerts"
          tone={openAlerts > 0 ? 'attention' : 'default'}
          sub={
            openAlerts > 0
              ? `${formatNumber(stats.alerts.HIGH)} cao · ${formatNumber(stats.alerts.MEDIUM)} trung bình · ${formatNumber(stats.alerts.LOW)} thấp`
              : 'Không có cảnh báo'
          }
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel className="min-w-0 px-5 py-5" aria-labelledby="hoat-dong">
          <SectionTitle
            id="hoat-dong"
            title="Event on-chain mỗi ngày"
            note="14 ngày gần nhất theo giờ Việt Nam, từ mọi contract Indexer theo dõi."
          />
          <ActivityChart days={stats.activity} />
        </Panel>
        <IndexerPanel indexer={stats.indexer} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel className="px-5 py-5" aria-labelledby="san-pham">
          <SectionTitle
            id="san-pham"
            title="Sản phẩm theo trạng thái"
            note="Chỉ tính sản phẩm đã phát hành trên chain."
          />
          <BarList
            label="Số sản phẩm theo trạng thái"
            rows={Object.values(ProductState).map((state) => ({
              key: state,
              label: PRODUCT_STATE_LABELS[state].label,
              value: stats.products.byState[state],
            }))}
          />
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="mb-2 text-sm font-medium">Bảo hành</h3>
            <CountList
              items={(['ACTIVE', 'SUSPENDED', 'EXPIRED'] as const).map((state) => ({
                label: WARRANTY_STATE_LABELS[state].label,
                value: stats.warranties[state],
              }))}
            />
          </div>
        </Panel>

        <Panel className="px-5 py-5" aria-labelledby="nghiep-vu">
          <SectionTitle id="nghiep-vu" title="Việc đang chạy" note="Tính trên toàn bộ dữ liệu." />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium">Bảo hành, sửa chữa</h3>
              <CountList
                items={[
                  { label: 'Chờ trung tâm nhận', value: stats.service.pending, attention: true },
                  { label: 'Đang sửa', value: stats.service.inRepair },
                  { label: 'Đã sửa xong', value: stats.service.repaired },
                  { label: 'Không sửa được', value: stats.service.notRepaired },
                ]}
              />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium">Kiểm định</h3>
              <CountList
                items={[
                  { label: 'Chờ kiểm định', value: stats.inspections.pending, attention: true },
                  { label: 'Đã có kết quả', value: stats.inspections.completed },
                  { label: 'Bị từ chối', value: stats.inspections.declined },
                ]}
              />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium">Chuyển nhượng</h3>
              <CountList
                items={[
                  { label: 'Chờ bên nhận', value: stats.transfers.pending, attention: true },
                  { label: 'Đã chuyển quyền', value: stats.transfers.completed },
                  { label: 'Bên nhận từ chối', value: stats.transfers.rejected },
                  { label: 'Chủ đã huỷ', value: stats.transfers.cancelled },
                  { label: 'Hết hạn', value: stats.transfers.expired },
                ]}
              />
            </div>
          </div>
        </Panel>
      </div>

      <Panel className="mt-6 px-5 py-5" aria-labelledby="doanh-nghiep">
        <SectionTitle id="doanh-nghiep" title="Doanh nghiệp theo loại" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th scope="col" className="py-2 pr-3 font-normal">
                  Loại
                </th>
                {STAGES.map((stage) => (
                  <th key={stage} scope="col" className="px-3 py-2 text-right font-normal">
                    {ORGANIZATION_STAGE_LABELS[stage].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {organizations.map((type) => (
                <tr key={type} className="border-t border-line">
                  <th scope="row" className="py-2 pr-3 font-normal">
                    {ORG_TYPE_LABELS[type]}
                  </th>
                  {STAGES.map((stage) => (
                    <td key={stage} className="px-3 py-2 text-right">
                      {formatNumber(stats.organizations[type][stage])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel className="mt-6 px-5 py-5" aria-labelledby="giao-dich">
        <SectionTitle
          id="giao-dich"
          title="Giao dịch gửi qua web"
          note="30 ngày gần nhất. Gas và thời gian chốt chỉ tính giao dịch đã chốt."
        />
        <dl className="mb-5 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          {(Object.keys(TX_STATUS_LABELS) as (keyof typeof TX_STATUS_LABELS)[]).map((status) => (
            <div key={status}>
              <dt className="text-muted">{TX_STATUS_LABELS[status]}</dt>
              <dd
                className={
                  (status === 'REVERTED' || status === 'FAILED') &&
                  stats.transactions.byStatus[status] > 0
                    ? 'text-lg font-semibold text-bad tabular-nums'
                    : 'text-lg font-semibold tabular-nums'
                }
              >
                {formatNumber(stats.transactions.byStatus[status])}
              </dd>
            </div>
          ))}
        </dl>
        {txTotal === 0 ? (
          <p className="text-sm text-muted">Chưa có giao dịch nào trong 30 ngày.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-normal">
                    Contract · hàm
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-normal">
                    Tổng
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-normal">
                    Đã chốt
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-normal">
                    Revert
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-normal">
                    Gas trung bình
                  </th>
                  <th scope="col" className="py-2 pl-3 text-right font-normal">
                    Chốt sau (giây)
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {stats.transactions.methods.map((method) => (
                  <tr
                    key={`${method.contractName}.${method.method}`}
                    className="border-t border-line"
                  >
                    <th scope="row" className="py-2 pr-3 font-normal">
                      <span className="text-muted">{method.contractName} · </span>
                      <code className="font-mono text-[13px]">{method.method}</code>
                    </th>
                    <td className="px-3 py-2 text-right">{formatNumber(method.total)}</td>
                    <td className="px-3 py-2 text-right">{formatNumber(method.confirmed)}</td>
                    <td
                      className={
                        method.reverted > 0
                          ? 'px-3 py-2 text-right font-medium text-bad'
                          : 'px-3 py-2 text-right'
                      }
                    >
                      {formatNumber(method.reverted)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {method.averageGasUsed ? formatNumber(Number(method.averageGasUsed)) : '—'}
                    </td>
                    <td className="py-2 pl-3 text-right">
                      {method.averageConfirmSeconds === null
                        ? '—'
                        : method.averageConfirmSeconds.toLocaleString('vi-VN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
