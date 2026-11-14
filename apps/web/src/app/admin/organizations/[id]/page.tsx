import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { HashText } from '@/components/ui/hash-text';
import { Panel } from '@/components/ui/panel';
import { adminContextOf, requireAdmin } from '@/features/admin/admin-context';
import { OrganizationActions } from '@/features/admin/organization-actions';
import { ChainLog } from '@/features/chain-log/chain-log';
import { ApplicationHistory } from '@/features/organization/application-history';
import { OrganizationDetails } from '@/features/organization/organization-details';
import {
  adminOverviewSchema,
  organizationDetailSchema,
} from '@/features/organization/organization.schema';
import { serverChainId } from '@/lib/env';
import { serverGet } from '@/lib/server-api';
import { ORGANIZATION_STAGE_LABELS } from '@/lib/state-labels';

export const metadata: Metadata = { title: 'Hồ sơ doanh nghiệp' };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Admin xem đủ hồ sơ, mọi lần nộp đơn và nhật ký on-chain của một doanh nghiệp trước khi quyết định. */
export default async function AdminOrganizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    notFound();
  }
  const [overview, detail] = await Promise.all([
    serverGet('/admin/overview', adminOverviewSchema),
    serverGet(`/admin/organizations/${id}`, organizationDetailSchema),
  ]);
  if (!detail) {
    notFound();
  }
  const chainId = serverChainId();
  const context = adminContextOf(overview, chainId);
  const { organization } = detail;
  const stage = ORGANIZATION_STAGE_LABELS[organization.stage];
  const canDecide = organization.stage === 'PENDING' || organization.stage === 'AUTHORIZED';

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href={{ pathname: '/admin/organizations', query: { stage: organization.stage } }}
        className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
      >
        ← Doanh nghiệp
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{organization.name}</h1>
        <Badge tone={stage.tone} dot>
          {stage.label}
        </Badge>
      </div>
      <p className="mt-2 max-w-2xl text-muted">
        Đối chiếu hồ sơ với hash đã ghi on-chain và mở từng giao dịch trên explorer trước khi quyết
        định. Lịch sử bên dưới không bị xoá khi đơn bị từ chối hay nộp lại.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 content-start gap-6">
          <Panel className="px-5 py-5" aria-labelledby="ho-so-hien-tai">
            <h2 id="ho-so-hien-tai" className="mb-4 font-semibold">
              Hồ sơ hiện tại
            </h2>
            <OrganizationDetails organization={organization} />
            {organization.profileHash ? (
              <p className="mt-4 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
                Hash hồ sơ gần nhất đã nộp <HashText value={organization.profileHash} />
              </p>
            ) : null}
          </Panel>
          <Panel className="px-5 py-5" aria-labelledby="cac-lan-nop">
            <h2 id="cac-lan-nop" className="mb-4 font-semibold">
              Các lần nộp đơn
            </h2>
            <ApplicationHistory applications={detail.applications} chainId={chainId} />
          </Panel>
          <Panel className="px-5 py-5" aria-labelledby="nhat-ky">
            <h2 id="nhat-ky" className="font-semibold">
              Nhật ký on-chain
            </h2>
            <p className="mt-1 mb-4 text-sm text-muted">
              Mọi event của doanh nghiệp trên PartyRegistry, đã chốt theo block finalized.
            </p>
            <ChainLog events={detail.chainLog} chainId={chainId} />
          </Panel>
        </div>

        <div className="grid content-start gap-6">
          <Panel className="px-5 py-5" aria-labelledby="quyet-dinh">
            <h2 id="quyet-dinh" className="font-semibold">
              Quyết định
            </h2>
            {!canDecide ? (
              <p className="mt-2 text-sm text-muted">
                {organization.stage === 'REJECTED'
                  ? 'Đơn đã bị từ chối. Người đại diện có thể sửa hồ sơ và nộp lại.'
                  : organization.stage === 'DISABLED'
                    ? 'Doanh nghiệp đã bị khoá.'
                    : 'Đơn chưa nộp phí nên chưa xét duyệt được.'}
              </p>
            ) : context ? (
              <div className="mt-3">
                <OrganizationActions organization={organization} context={context} />
              </div>
            ) : (
              <p className="mt-2 text-sm text-warn">
                Ví đang liên kết chưa có quyền Admin trên PartyRegistry nên chưa ký được quyết định.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
