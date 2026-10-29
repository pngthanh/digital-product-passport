import { explorerAddressUrl, formatMon, type OrganizationSummary } from '@dpp/shared';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { HashText } from '@/components/ui/hash-text';
import { Panel } from '@/components/ui/panel';
import { getIdentity } from '@/features/auth/get-identity';
import { ChainLog } from '@/features/chain-log/chain-log';
import { ApplicationHistory } from '@/features/organization/application-history';
import { FeePaymentList, OrganizationDetails } from '@/features/organization/organization-details';
import { OrganizationForm } from '@/features/organization/organization-form';
import { myOrganizationSchema } from '@/features/organization/organization.schema';
import { RefundButton } from '@/features/organization/refund-button';
import { serverChainId } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { serverGet } from '@/lib/server-api';
import { ORGANIZATION_STAGE_LABELS } from '@/lib/state-labels';

export const metadata: Metadata = { title: 'Doanh nghiệp' };

const STAGE_NOTES: Record<
  OrganizationSummary['stage'],
  (organization: OrganizationSummary) => string
> = {
  DRAFT: () => 'Hồ sơ đã lưu nhưng chưa nộp phí. Kiểm tra lại thông tin rồi nộp phí để gửi đơn.',
  PENDING: (organization) =>
    `Đơn nộp ngày ${formatDate(organization.appliedAt ?? '')} đang chờ quản trị viên duyệt. Phí đang được contract giữ.`,
  AUTHORIZED: (organization) =>
    `Doanh nghiệp được duyệt ngày ${formatDate(organization.approvedAt ?? '')}. Ví cá nhân của bạn ký các giao dịch nghiệp vụ thay cho doanh nghiệp.`,
  REJECTED: () => 'Đơn bị từ chối. Rút phí đã nộp về ví, hoặc sửa hồ sơ và nộp lại với phí mới.',
  DISABLED: (organization) =>
    `Doanh nghiệp bị khoá ngày ${formatDate(organization.disabledAt ?? '')}. Lịch sử đã ghi trên blockchain vẫn được giữ nguyên.`,
};

function ExplorerLink({ href }: { href: string | null }) {
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="text-muted hover:text-ink">
      Xem trên explorer
    </a>
  ) : null;
}

export default async function OrganizationPage() {
  const identity = await getIdentity();
  if (!identity) {
    redirect('/login');
  }
  const chainId = serverChainId();
  const view = await serverGet('/me/organization', myOrganizationSchema);
  const wallet = identity.wallets.find((candidate) => candidate.status === 'ACTIVE')?.address;
  const organization = view?.organization ?? null;
  const editable =
    !organization || organization.stage === 'DRAFT' || organization.stage === 'REJECTED';
  const stage = organization ? ORGANIZATION_STAGE_LABELS[organization.stage] : null;
  const fee = view?.registrationFee ?? null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-sm text-muted">Doanh nghiệp</p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          {organization?.name ?? 'Đăng ký doanh nghiệp'}
        </h1>
        {stage ? (
          <Badge tone={stage.tone} dot>
            {stage.label}
          </Badge>
        ) : null}
      </div>
      <p className="mt-2 max-w-2xl text-muted">
        {organization
          ? STAGE_NOTES[organization.stage](organization)
          : 'Doanh nghiệp được duyệt sẽ có quyền ghi sản phẩm, bàn giao, bảo hành hoặc kiểm định lên blockchain theo đúng loại đã đăng ký.'}
      </p>

      {view === null ? (
        <Panel className="mt-8 px-5 py-6">
          <p className="font-medium text-bad">Không tải được thông tin doanh nghiệp từ API.</p>
          <p className="mt-1 text-sm text-muted">Kiểm tra API đang chạy rồi tải lại trang.</p>
        </Panel>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="grid content-start gap-6">
            {organization?.stage === 'REJECTED' || organization?.stage === 'DISABLED' ? (
              <Panel className="border-bad/30 px-5 py-5" aria-labelledby="ly-do">
                <h2 id="ly-do" className="font-semibold">
                  {organization.stage === 'REJECTED' ? 'Lý do từ chối' : 'Lý do khoá'}
                </h2>
                <p className="mt-2 text-[15px]">
                  {organization.statusReason ?? 'Không có ghi chú.'}
                </p>
                {organization.stage === 'REJECTED' &&
                organization.refundableWei !== '0' &&
                wallet &&
                view.contract ? (
                  <div className="mt-4 border-t border-line pt-4">
                    <RefundButton
                      amountWei={organization.refundableWei}
                      chainId={chainId}
                      contractAddress={view.contract.address}
                      wallet={wallet}
                      partyId={organization.partyId}
                    />
                  </div>
                ) : null}
              </Panel>
            ) : null}

            {editable ? (
              <Panel className="px-5 py-5" aria-labelledby="ho-so">
                <h2 id="ho-so" className="font-semibold">
                  {organization?.stage === 'REJECTED'
                    ? 'Sửa hồ sơ và nộp lại'
                    : 'Hồ sơ doanh nghiệp'}
                </h2>
                <p className="mt-1 mb-5 text-sm text-muted">
                  Bạn là người đại diện: mọi giao dịch của doanh nghiệp do ví cá nhân của bạn ký và
                  trả phí.
                </p>
                {!view.contract ? (
                  <p className="rounded-control bg-warn-tint px-3 py-2 text-sm text-warn">
                    Hệ thống chưa cấu hình PartyRegistry nên chưa nhận đơn.
                  </p>
                ) : wallet ? (
                  <OrganizationForm
                    initial={organization}
                    feeWei={fee?.amountWei ?? null}
                    chainId={chainId}
                  />
                ) : (
                  <div className="grid gap-3">
                    <p className="text-sm">
                      Bạn cần liên kết ví MetaMask trước. Ví này nộp phí đăng ký và ký mọi giao dịch
                      của doanh nghiệp.
                    </p>
                    <ButtonLink href="/account" className="justify-self-start">
                      Liên kết ví ở trang Tài khoản
                    </ButtonLink>
                  </div>
                )}
              </Panel>
            ) : organization ? (
              <Panel className="px-5 py-5" aria-labelledby="thong-tin">
                <h2 id="thong-tin" className="mb-4 font-semibold">
                  Thông tin doanh nghiệp
                </h2>
                <OrganizationDetails organization={organization} />
              </Panel>
            ) : null}

            {view.history.applications.length > 0 ? (
              <Panel className="px-5 py-5" aria-labelledby="cac-lan-nop">
                <h2 id="cac-lan-nop" className="mb-4 font-semibold">
                  Các lần nộp đơn
                </h2>
                <ApplicationHistory applications={view.history.applications} chainId={chainId} />
              </Panel>
            ) : null}
            {view.history.chainLog.length > 0 ? (
              <Panel className="px-5 py-5" aria-labelledby="nhat-ky">
                <h2 id="nhat-ky" className="font-semibold">
                  Nhật ký on-chain
                </h2>
                <p className="mt-1 mb-4 text-sm text-muted">
                  Mọi giao dịch của doanh nghiệp trên PartyRegistry; bấm mã giao dịch để xem trên
                  explorer.
                </p>
                <ChainLog events={view.history.chainLog} chainId={chainId} />
              </Panel>
            ) : null}
          </div>

          <div className="grid content-start gap-6">
            <Panel className="px-5 py-5" aria-labelledby="phi-dang-ky">
              <h2 id="phi-dang-ky" className="font-semibold">
                Phí đăng ký
              </h2>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {fee ? `${formatMon(BigInt(fee.amountWei))} MON` : 'Đang đồng bộ'}
              </p>
              <p className="mt-1 text-sm text-muted">Cộng phí gas do mạng Monad thu riêng.</p>
              {view.contract ? (
                <dl className="mt-4 grid gap-3 text-sm">
                  <div>
                    <dt className="text-muted">Contract PartyRegistry</dt>
                    <dd className="flex flex-wrap items-center gap-x-2">
                      <HashText value={view.contract.address} />
                      <ExplorerLink href={explorerAddressUrl(chainId, view.contract.address)} />
                    </dd>
                  </div>
                  {fee ? (
                    <div>
                      <dt className="text-muted">Ví Treasury nhận phí khi được duyệt</dt>
                      <dd>
                        <HashText value={fee.treasury} />
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
            </Panel>
            {organization ? (
              <Panel className="px-5 py-5" aria-labelledby="lich-su-phi">
                <h2 id="lich-su-phi" className="mb-4 font-semibold">
                  Các lần nộp phí
                </h2>
                <FeePaymentList organization={organization} chainId={chainId} />
              </Panel>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
