import type { ServiceRequestView } from '@dpp/shared';
import { CircleCheck, FileText, TriangleAlert } from 'lucide-react';
import { ChainLink } from '@/components/ui/chain-link';
import { HashText } from '@/components/ui/hash-text';
import { BROWSER_API_BASE } from '@/lib/env';
import { formatDate, formatTime } from '@/lib/format';
import { SERVICE_ACTION_LABELS } from '@/lib/state-labels';

function when(value: string): string {
  return `${formatDate(value)} ${formatTime(value)}`;
}

/** "Trong bảo hành" hay "Ngoài bảo hành" theo bảo hành lúc mở phiếu. */
export function coverageText(covered: boolean | null): string | null {
  return covered === null ? null : covered ? 'Trong bảo hành' : 'Ngoài bảo hành';
}

/**
 * Các mốc của một phiếu (mở, đóng) kèm giao dịch, và biên bản: việc đã làm, file đính kèm, hash
 * đã ghi on-chain cùng kết quả băm lại để đối chiếu.
 */
export function ServiceRecord({
  request,
  chainId,
}: {
  request: ServiceRequestView;
  chainId: number;
}) {
  const record = request.record;
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
      {request.openedAt && request.openTxHash ? (
        <>
          <dt className="text-muted">Tiếp nhận</dt>
          <dd className="flex flex-wrap items-center gap-x-2">
            {when(request.openedAt)} · {coverageText(request.warrantyCovered)}
            <ChainLink chainId={chainId} value={request.openTxHash} kind="tx" />
          </dd>
        </>
      ) : null}
      {request.closedAt && request.closeTxHash ? (
        <>
          <dt className="text-muted">Đóng phiếu</dt>
          <dd className="flex flex-wrap items-center gap-x-2">
            {when(request.closedAt)}
            <ChainLink chainId={chainId} value={request.closeTxHash} kind="tx" />
          </dd>
        </>
      ) : null}
      {record ? (
        <>
          <dt className="text-muted">Đã làm</dt>
          <dd>
            {SERVICE_ACTION_LABELS[record.actionCode]}
            {record.actionDetail ? (
              <span className="block whitespace-pre-line text-muted">{record.actionDetail}</span>
            ) : null}
          </dd>
          <dt className="text-muted">Biên bản</dt>
          <dd className="grid gap-1">
            {record.fileType ? (
              <a
                href={`${BROWSER_API_BASE}/me/service-requests/${request.id}/evidence`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-tint-ink underline-offset-4 hover:underline"
              >
                <FileText aria-hidden className="size-4" />
                {record.fileType === 'application/pdf' ? 'Mở file PDF' : 'Xem ảnh'}
              </a>
            ) : (
              <span className="text-muted">Không đính kèm file</span>
            )}
            <span className="flex flex-wrap items-center gap-x-1.5 text-muted">
              Hash <HashText value={record.evidenceHash} />
            </span>
            {record.syncStatus !== 'CONFIRMED' ? (
              <span className="text-warn">Chưa ghi lên blockchain</span>
            ) : record.matchesOnchain === true ? (
              <span className="inline-flex items-center gap-1.5 text-ok">
                <CircleCheck aria-hidden className="size-4" />
                Băm lại biên bản khớp hash đã ghi on-chain
              </span>
            ) : record.matchesOnchain === false ? (
              <span className="inline-flex items-center gap-1.5 text-bad">
                <TriangleAlert aria-hidden className="size-4" />
                Biên bản đang lưu không khớp hash on-chain (đã bị sửa)
              </span>
            ) : null}
          </dd>
        </>
      ) : null}
    </dl>
  );
}
