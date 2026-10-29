import { explorerTxUrl, formatMon, type OrganizationSummary } from '@dpp/shared';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { HashText } from '@/components/ui/hash-text';
import { formatDate } from '@/lib/format';
import { FEE_STATUS_LABELS, ORG_TYPE_LABELS } from '@/lib/state-labels';

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** Hồ sơ doanh nghiệp đã khai (dữ liệu off-chain), hash hồ sơ đã ghi lên contract. */
export function OrganizationDetails({ organization }: { organization: OrganizationSummary }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      <Detail label="Tên doanh nghiệp">{organization.name}</Detail>
      <Detail label="Loại">{ORG_TYPE_LABELS[organization.orgType]}</Detail>
      <Detail label="Mã số thuế">
        <span className="font-mono text-[14px]">{organization.taxCode}</span>
      </Detail>
      <Detail label="Email liên hệ">{organization.contactEmail}</Detail>
      <Detail label="Số điện thoại">{organization.contactPhone ?? 'Không có'}</Detail>
      <Detail label="Địa chỉ">{organization.address ?? 'Không có'}</Detail>
      <Detail label="Người đại diện">
        {organization.representative.fullName}
        <span className="block text-sm text-muted">{organization.representative.email}</span>
      </Detail>
      <Detail label="partyId của doanh nghiệp">
        <HashText value={organization.partyId} />
      </Detail>
    </dl>
  );
}

/** Lịch sử các lần nộp phí (mới nhất trước) và dòng tiền của từng khoản. */
export function FeePaymentList({
  organization,
  chainId,
}: {
  organization: OrganizationSummary;
  chainId: number;
}) {
  if (organization.feePayments.length === 0) {
    return <p className="text-sm text-muted">Chưa nộp phí lần nào.</p>;
  }
  return (
    <ul className="divide-y divide-line">
      {organization.feePayments.map((payment) => {
        const status = FEE_STATUS_LABELS[payment.feeStatus];
        const txUrl = explorerTxUrl(chainId, payment.paidTxHash);
        return (
          <li
            key={payment.paidTxHash}
            className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="font-medium tabular-nums">{formatMon(BigInt(payment.amountWei))} MON</p>
              <p className="text-sm text-muted">
                Nộp ngày {formatDate(payment.paidAt)}
                {txUrl ? (
                  <>
                    {' · '}
                    <a href={txUrl} target="_blank" rel="noreferrer" className="hover:text-ink">
                      giao dịch
                    </a>
                  </>
                ) : null}
              </p>
            </div>
            <Badge tone={status.tone}>{status.label}</Badge>
          </li>
        );
      })}
    </ul>
  );
}
