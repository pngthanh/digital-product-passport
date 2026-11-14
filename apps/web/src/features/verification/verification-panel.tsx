import type { PublicVerificationView, VerificationStatus } from '@dpp/shared';
import { CircleAlert, CircleCheck, CircleDashed, CircleHelp } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDate, formatTime } from '@/lib/format';
import { CHECK_LABELS, onchainValue, STATUS_SUMMARY } from './verification-text';

const ICONS: Record<VerificationStatus, typeof CircleCheck> = {
  MATCH: CircleCheck,
  MISMATCH: CircleAlert,
  SYNCING: CircleDashed,
  UNAVAILABLE: CircleHelp,
};

const TEXT_CLASSES: Record<VerificationStatus, string> = {
  MATCH: 'text-ok',
  MISMATCH: 'text-bad',
  SYNCING: 'text-muted',
  UNAVAILABLE: 'text-muted',
};

const SUMMARY_CLASSES: Record<VerificationStatus, string> = {
  MATCH: 'border-ok/30 bg-ok-tint',
  MISMATCH: 'border-bad/40 bg-bad-tint',
  SYNCING: 'border-line bg-tint',
  UNAVAILABLE: 'border-warn/40 bg-warn-tint',
};

/**
 * VER-01 (M11): kết quả máy chủ đối chiếu từng mục với contract tại block Indexer đã chốt. Mục lệch
 * ghi giá trị trên blockchain để người xem tin theo đó.
 */
export function VerificationPanel({
  verification,
}: {
  verification: PublicVerificationView | null;
}) {
  if (!verification) {
    return (
      <p className="text-sm text-muted">
        Chưa tải được kết quả đối chiếu. Tải lại trang, hoặc tự kiểm tra bằng trình duyệt bên dưới.
      </p>
    );
  }
  const summary = STATUS_SUMMARY[verification.status];
  const SummaryIcon = ICONS[verification.status];
  return (
    <div className="grid gap-4">
      <div
        className={cn(
          'flex items-start gap-2.5 rounded-control border px-3.5 py-3',
          SUMMARY_CLASSES[verification.status],
        )}
        role={verification.status === 'MISMATCH' ? 'alert' : undefined}
      >
        <SummaryIcon
          aria-hidden
          className={cn('mt-0.5 size-5 shrink-0', TEXT_CLASSES[verification.status])}
        />
        <div className="min-w-0">
          <p className="font-medium">{summary.title}</p>
          <p className="text-sm text-muted">{summary.body}</p>
        </div>
      </div>
      <ul className="grid gap-2 text-sm">
        {verification.checks.map((check) => {
          const Icon = ICONS[check.status];
          return (
            <li key={check.key} className="flex items-start gap-2">
              <Icon
                aria-hidden
                className={cn('mt-0.5 size-4 shrink-0', TEXT_CLASSES[check.status])}
              />
              <span className="min-w-0">
                <span className={cn(check.status === 'MISMATCH' && 'font-medium text-bad')}>
                  {CHECK_LABELS[check.key]}
                </span>
                {check.status === 'MISMATCH' && verification.onchain ? (
                  <span className="block text-muted">
                    Trên blockchain: {onchainValue(check.key, verification.onchain)}
                  </span>
                ) : null}
                {check.status === 'SYNCING' ? (
                  <span className="block text-muted">Đang cập nhật</span>
                ) : null}
                {check.status === 'UNAVAILABLE' ? (
                  <span className="block text-muted">Chưa đọc được</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      {verification.atBlock ? (
        <p className="text-[13px] text-muted tabular-nums">
          Đọc contract tại block {verification.atBlock}
          {verification.indexedAt
            ? `, dữ liệu chốt lúc ${formatTime(verification.indexedAt)} ${formatDate(verification.indexedAt)}`
            : ''}
          .
        </p>
      ) : null}
    </div>
  );
}
