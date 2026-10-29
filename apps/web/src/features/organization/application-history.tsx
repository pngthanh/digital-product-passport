import { formatMon, type OrganizationApplicationView } from '@dpp/shared';
import { CircleAlert, CircleCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { ChainLink } from '@/components/ui/chain-link';
import { HashText } from '@/components/ui/hash-text';
import { formatDate, formatTime } from '@/lib/format';
import { FEE_STATUS_LABELS, ORG_TYPE_LABELS, ORGANIZATION_STAGE_LABELS } from '@/lib/state-labels';

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-0.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** Kết quả băm lại dữ liệu off-chain so với hash đã ghi on-chain. */
function ChainMatch({ matches, what }: { matches: boolean | null; what: string }) {
  if (matches === null) {
    return null;
  }
  return matches ? (
    <span className="inline-flex items-center gap-1 text-sm text-ok">
      <CircleCheck className="size-4" aria-hidden />
      {what} khớp hash on-chain
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-sm text-bad">
      <CircleAlert className="size-4" aria-hidden />
      {what} không khớp hash on-chain
    </span>
  );
}

function dateTime(value: string): string {
  return `${formatDate(value)} ${formatTime(value)}`;
}

function Round({
  application,
  chainId,
}: {
  application: OrganizationApplicationView;
  chainId: number;
}) {
  const status = ORGANIZATION_STAGE_LABELS[application.status];
  const fee = application.fee;
  const profile = application.profile;
  return (
    <li className="grid gap-4 py-5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Lần nộp {application.round}</h3>
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        <Item label="Nộp lúc">{dateTime(application.appliedAt)}</Item>
        <Item label="Giao dịch nộp đơn">
          <ChainLink chainId={chainId} value={application.appliedTxHash} kind="tx" />
        </Item>
        <Item label="Ví ký nộp đơn">
          <ChainLink chainId={chainId} value={application.applicantAddress} kind="address" />
        </Item>
        <Item label="Phí">
          {fee ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums">{formatMon(BigInt(fee.amountWei))} MON</span>
              <Badge tone={FEE_STATUS_LABELS[fee.feeStatus].tone}>
                {FEE_STATUS_LABELS[fee.feeStatus].label}
              </Badge>
            </span>
          ) : (
            'Không có'
          )}
        </Item>
        {fee?.refundTxHash ? (
          <Item label="Giao dịch rút phí về ví">
            <ChainLink chainId={chainId} value={fee.refundTxHash} kind="tx" />
          </Item>
        ) : null}
        {fee?.settledTxHash ? (
          <Item label="Giao dịch chuyển phí về Treasury">
            <ChainLink chainId={chainId} value={fee.settledTxHash} kind="tx" />
          </Item>
        ) : null}
        {application.decidedAt && application.decidedTxHash ? (
          <>
            <Item label={application.status === 'REJECTED' ? 'Từ chối lúc' : 'Duyệt lúc'}>
              {dateTime(application.decidedAt)}
            </Item>
            <Item label="Giao dịch quyết định">
              <ChainLink chainId={chainId} value={application.decidedTxHash} kind="tx" />
            </Item>
            {application.decidedByAddress ? (
              <Item label="Ví Admin ký">
                <ChainLink chainId={chainId} value={application.decidedByAddress} kind="address" />
              </Item>
            ) : null}
          </>
        ) : null}
      </dl>

      {application.status === 'REJECTED' ? (
        <div className="grid gap-1 rounded-control bg-bad-tint/60 px-3 py-2.5">
          <p className="text-sm text-muted">Lý do từ chối</p>
          <p>{application.decisionReason ?? 'Không còn nội dung lý do trong CSDL.'}</p>
          <ChainMatch matches={application.reasonMatchesChain} what="Lý do" />
        </div>
      ) : null}

      <div className="grid gap-3 rounded-control border border-line px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Hồ sơ đã nộp lần này</p>
          <ChainMatch matches={application.profileMatchesChain} what="Hồ sơ" />
        </div>
        {profile ? (
          <dl className="grid gap-3 text-[15px] sm:grid-cols-2">
            <Item label="Tên doanh nghiệp">{profile.name}</Item>
            <Item label="Loại">{ORG_TYPE_LABELS[profile.orgType]}</Item>
            <Item label="Mã số thuế">
              <span className="font-mono text-[14px]">{profile.taxCode}</span>
            </Item>
            <Item label="Email liên hệ">{profile.contactEmail}</Item>
            <Item label="Số điện thoại">{profile.contactPhone ?? 'Không có'}</Item>
            <Item label="Địa chỉ">{profile.address ?? 'Không có'}</Item>
          </dl>
        ) : (
          <p className="text-sm text-muted">
            Lần nộp này diễn ra trước khi hệ thống lưu bản chụp hồ sơ, nên chỉ còn hash đã ghi
            on-chain. Loại đăng ký: {ORG_TYPE_LABELS[application.orgType]}.
          </p>
        )}
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
          Hash hồ sơ <HashText value={application.profileHash} />
        </p>
      </div>
    </li>
  );
}

/** Mọi lần nộp đơn, mới nhất trước; lần bị từ chối vẫn giữ đủ hồ sơ, lý do và mã giao dịch. */
export function ApplicationHistory({
  applications,
  chainId,
}: {
  applications: OrganizationApplicationView[];
  chainId: number;
}) {
  if (applications.length === 0) {
    return <p className="text-sm text-muted">Chưa nộp đơn lần nào.</p>;
  }
  return (
    <ol className="divide-y divide-line">
      {applications.map((application) => (
        <Round key={application.appliedTxHash} application={application} chainId={chainId} />
      ))}
    </ol>
  );
}
