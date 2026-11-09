import type { EvidenceMimeType, InspectionResult } from '@dpp/shared';
import { CircleCheck, FileText, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ChainLink } from '@/components/ui/chain-link';
import { HashText } from '@/components/ui/hash-text';
import { formatDate, formatTime } from '@/lib/format';
import { INSPECTION_RESULT_LABELS } from '@/lib/state-labels';

/** Phần biên bản cần hiển thị, chung cho trang người gửi, đơn vị kiểm định và hộ chiếu công khai. */
export interface ReportFacts {
  result: InspectionResult;
  summary: string;
  fileType: EvidenceMimeType | null;
  reportHash: string;
  inspectedAt: string | null;
  txHash: string | null;
  /** Đã ghi lên blockchain (event InspectionRecorded đã chốt). */
  confirmed: boolean;
  matchesOnchain: boolean | null;
}

export function InspectionResultBadge({ result }: { result: InspectionResult }) {
  const label = INSPECTION_RESULT_LABELS[result];
  return (
    <Badge tone={label.tone} dot>
      {label.label}
    </Badge>
  );
}

/**
 * Kết quả kiểm định: kết luận, file biên bản, hash đã ghi on-chain cùng kết quả băm lại để đối chiếu
 * và giao dịch ghi kết quả.
 */
export function InspectionReport({
  report,
  fileHref,
  chainId,
}: {
  report: ReportFacts;
  fileHref: string;
  chainId: number;
}) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
      <dt className="text-muted">Kết quả</dt>
      <dd>
        <InspectionResultBadge result={report.result} />
      </dd>
      <dt className="text-muted">Kết luận</dt>
      <dd className="whitespace-pre-line">{report.summary}</dd>
      {report.inspectedAt && report.txHash ? (
        <>
          <dt className="text-muted">Ghi nhận</dt>
          <dd className="flex flex-wrap items-center gap-x-2">
            {formatDate(report.inspectedAt)} {formatTime(report.inspectedAt)}
            <ChainLink chainId={chainId} value={report.txHash} kind="tx" />
          </dd>
        </>
      ) : null}
      <dt className="text-muted">Biên bản</dt>
      <dd className="grid gap-1">
        {report.fileType ? (
          <a
            href={fileHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-tint-ink underline-offset-4 hover:underline"
          >
            <FileText aria-hidden className="size-4" />
            {report.fileType === 'application/pdf' ? 'Mở file PDF' : 'Xem ảnh'}
          </a>
        ) : (
          <span className="text-muted">Không đính kèm file</span>
        )}
        <span className="flex flex-wrap items-center gap-x-1.5 text-muted">
          Hash <HashText value={report.reportHash} />
        </span>
        {!report.confirmed ? (
          <span className="text-warn">Chưa ghi lên blockchain</span>
        ) : report.matchesOnchain === true ? (
          <span className="inline-flex items-center gap-1.5 text-ok">
            <CircleCheck aria-hidden className="size-4" />
            Băm lại biên bản khớp hash đã ghi on-chain
          </span>
        ) : report.matchesOnchain === false ? (
          <span className="inline-flex items-center gap-1.5 text-bad">
            <TriangleAlert aria-hidden className="size-4" />
            Biên bản đang lưu không khớp hash on-chain (đã bị sửa)
          </span>
        ) : null}
      </dd>
    </dl>
  );
}
