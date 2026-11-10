import type { TransferRequestView } from '@dpp/shared';
import { Badge } from '@/components/ui/badge';
import { ChainLink } from '@/components/ui/chain-link';
import { formatDate, formatTime } from '@/lib/format';
import { TRANSFER_STATE_LABELS } from '@/lib/state-labels';
import { TransferPartyName } from './transfer-party';

/** Nhãn trạng thái; yêu cầu còn mở nhưng quá hạn hiện "Quá hạn" dù on-chain chưa đóng. */
export function TransferStateBadge({ request }: { request: TransferRequestView }) {
  if (request.state === 'REQUESTED' && request.expired) {
    return (
      <Badge tone="warn" dot>
        Quá hạn, chưa đóng
      </Badge>
    );
  }
  const state = TRANSFER_STATE_LABELS[request.state];
  return (
    <Badge tone={state.tone} dot>
      {state.label}
    </Badge>
  );
}

/** Bên gửi, bên nhận, hạn chấp nhận và các giao dịch của một yêu cầu chuyển nhượng. */
export function TransferSummary({
  request,
  chainId,
}: {
  request: TransferRequestView;
  chainId: number;
}) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      <div className="grid gap-0.5">
        <dt className="text-muted">Bên gửi</dt>
        <dd className="min-w-0 break-words">
          <TransferPartyName party={request.from} />
        </dd>
      </div>
      <div className="grid gap-0.5">
        <dt className="text-muted">Bên nhận</dt>
        <dd className="min-w-0 break-words">
          <TransferPartyName party={request.to} />
        </dd>
      </div>
      <div className="grid gap-0.5">
        <dt className="text-muted">{request.closedAt ? 'Đóng lúc' : 'Hạn chấp nhận'}</dt>
        <dd className="tabular-nums">
          {request.closedAt
            ? `${formatTime(request.closedAt)} ${formatDate(request.closedAt)}`
            : `${formatTime(request.expiresAt)} ${formatDate(request.expiresAt)}`}
        </dd>
      </div>
      <div className="grid gap-0.5">
        <dt className="text-muted">Giao dịch</dt>
        <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <span className="text-muted">Tạo</span>
            <ChainLink chainId={chainId} value={request.createdTxHash} kind="tx" />
          </span>
          {request.closedTxHash ? (
            <span className="inline-flex items-center gap-1">
              <span className="text-muted">Đóng</span>
              <ChainLink chainId={chainId} value={request.closedTxHash} kind="tx" />
            </span>
          ) : null}
        </dd>
      </div>
    </dl>
  );
}
