import { formatMon, type OrganizationStage, type OrganizationSummary } from '@dpp/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { HashText } from '@/components/ui/hash-text';
import { Panel } from '@/components/ui/panel';
import { adminContextOf, requireAdmin } from '@/features/admin/admin-context';
import type { AdminContext } from '@/features/admin/admin-flows';
import { FeeSettings } from '@/features/admin/fee-settings';
import { OrganizationActions } from '@/features/admin/organization-actions';
import { OrganizationDetails } from '@/features/organization/organization-details';
import {
  adminOrganizationListSchema,
  adminOverviewSchema,
} from '@/features/organization/organization.schema';
import { cn } from '@/lib/cn';
import { serverChainId } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { serverGet } from '@/lib/server-api';
import { FEE_STATUS_LABELS, ORGANIZATION_STAGE_LABELS } from '@/lib/state-labels';

export const metadata: Metadata = { title: 'Quản trị' };

const FILTERS: readonly OrganizationStage[] = ['PENDING', 'AUTHORIZED', 'REJECTED', 'DISABLED'];

function readStage(value: string | string[] | undefined): OrganizationStage {
  return FILTERS.find((stage) => stage === value) ?? 'PENDING';
}

function OrganizationRow({
  organization,
  context,
}: {
  organization: OrganizationSummary;
  context: AdminContext | null;
}) {
  const stage = ORGANIZATION_STAGE_LABELS[organization.stage];
  const latestFee = organization.feePayments[0];
  return (
    <li className="grid gap-4 px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{organization.name}</p>
          <p className="text-sm text-muted">
            {organization.appliedAt
              ? `Nộp đơn ${formatDate(organization.appliedAt)}`
              : 'Chưa nộp đơn'}
            {latestFee
              ? ` · Phí ${formatMon(BigInt(latestFee.amountWei))} MON, ${FEE_STATUS_LABELS[latestFee.feeStatus].label.toLowerCase()}`
              : ''}
          </p>
        </div>
        <Badge tone={stage.tone} dot>
          {stage.label}
        </Badge>
      </div>
      <OrganizationDetails organization={organization} />
      {organization.statusReason ? (
        <p className="rounded-control bg-canvas px-3 py-2 text-sm">
          <span className="text-muted">Lý do: </span>
          {organization.statusReason}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/admin/organizations/${organization.id}`}
          className="text-sm font-medium text-tint-ink underline-offset-4 hover:underline"
        >
          Xem mọi lần nộp đơn và nhật ký on-chain
        </Link>
        {context && (organization.stage === 'PENDING' || organization.stage === 'AUTHORIZED') ? (
          <OrganizationActions organization={organization} context={context} />
        ) : null}
      </div>
    </li>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const stage = readStage((await searchParams).stage);
  const [overview, list] = await Promise.all([
    serverGet('/admin/overview', adminOverviewSchema),
    serverGet(`/admin/organizations?stage=${stage}`, adminOrganizationListSchema),
  ]);
  const context = adminContextOf(overview, serverChainId());

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-sm text-muted">Quản trị</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Doanh nghiệp và phí</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Duyệt, từ chối hoặc khoá doanh nghiệp. Mỗi quyết định là một giao dịch do ví Admin của bạn
        ký trên PartyRegistry.
      </p>

      {overview === null ? (
        <Panel className="mt-8 px-5 py-6">
          <p className="font-medium text-bad">Không tải được dữ liệu quản trị từ API.</p>
        </Panel>
      ) : (
        <>
          {!overview.adminWallet ? (
            <p className="mt-6 rounded-control bg-warn-tint px-3 py-2 text-sm text-warn">
              Tài khoản Admin chưa liên kết ví. Liên kết đúng ví MetaMask đã deploy PartyRegistry ở
              trang Tài khoản để ký các quyết định.
            </p>
          ) : overview.walletHasAdminRole === false ? (
            <p className="mt-6 rounded-control bg-bad-tint px-3 py-2 text-sm text-bad">
              Ví đang liên kết không có quyền Admin trên PartyRegistry nên không ký được quyết định.
              Dùng tài khoản đã liên kết ví deploy contract.
            </p>
          ) : null}

          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="grid content-start gap-4">
              <nav aria-label="Lọc theo trạng thái" className="flex flex-wrap gap-1.5">
                {FILTERS.map((filter) => (
                  <Link
                    key={filter}
                    href={{ pathname: '/admin', query: { stage: filter } }}
                    aria-current={filter === stage ? 'page' : undefined}
                    className={cn(
                      'flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
                      filter === stage
                        ? 'border-primary bg-primary font-medium text-primary-ink'
                        : 'border-line-strong text-muted hover:bg-tint hover:text-ink',
                    )}
                  >
                    {ORGANIZATION_STAGE_LABELS[filter].label}
                    <span className="tabular-nums opacity-80">{overview.counts[filter]}</span>
                  </Link>
                ))}
              </nav>
              <Panel>
                {list === null ? (
                  <p className="px-5 py-6 text-sm text-bad">Không tải được danh sách.</p>
                ) : list.items.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-muted">
                    Không có doanh nghiệp nào ở trạng thái này.
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {list.items.map((organization) => (
                      <OrganizationRow
                        key={organization.id}
                        organization={organization}
                        context={context}
                      />
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <div className="grid content-start gap-6">
              <Panel className="px-5 py-5" aria-labelledby="phi-treasury">
                <h2 id="phi-treasury" className="font-semibold">
                  Phí và Treasury
                </h2>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {overview.registrationFee
                    ? `${formatMon(BigInt(overview.registrationFee.amountWei))} MON`
                    : 'Đang đồng bộ'}
                </p>
                {overview.registrationFee ? (
                  <p className="mt-1 text-sm text-muted">
                    Treasury <HashText value={overview.registrationFee.treasury} />
                  </p>
                ) : null}
                {context ? (
                  <div className="mt-5 border-t border-line pt-5">
                    <FeeSettings
                      context={context}
                      currentFeeWei={overview.registrationFee?.amountWei ?? null}
                      currentTreasury={overview.registrationFee?.treasury ?? null}
                    />
                  </div>
                ) : null}
              </Panel>
              <Panel className="px-5 py-5" aria-labelledby="he-thong">
                <h2 id="he-thong" className="font-semibold">
                  Hệ thống
                </h2>
                <dl className="mt-3 grid gap-3 text-sm">
                  <div>
                    <dt className="text-muted">PartyRegistry</dt>
                    <dd>
                      {overview.contract ? (
                        <HashText value={overview.contract.address} />
                      ) : (
                        'Chưa cấu hình'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Ví Admin đang dùng</dt>
                    <dd>
                      {overview.adminWallet ? (
                        <HashText value={overview.adminWallet} />
                      ) : (
                        'Chưa liên kết'
                      )}
                    </dd>
                  </div>
                </dl>
                <Link
                  href="/system/status"
                  className="mt-4 inline-block text-sm font-medium text-tint-ink underline-offset-4 hover:underline"
                >
                  Trạng thái hệ thống (CSDL, blockchain, Indexer)
                </Link>
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
