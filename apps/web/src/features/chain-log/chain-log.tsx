import { type ChainEventView, decodeChainEnum, formatMon } from '@dpp/shared';
import { ChainLink } from '@/components/ui/chain-link';
import { formatDate, formatTime } from '@/lib/format';
import { PRODUCT_STATE_LABELS } from '@/lib/state-labels';

const EVENT_LABELS: Record<string, string> = {
  PartyRegistered: 'Tạo danh tính on-chain',
  WalletRotated: 'Đổi ví cá nhân',
  OrganizationApplied: 'Nộp đơn',
  FeePaid: 'Nộp phí',
  OrganizationRejected: 'Từ chối đơn',
  FeeRefunded: 'Rút phí về ví',
  OrganizationApproved: 'Duyệt đơn',
  FeeSettled: 'Phí chuyển về Treasury',
  OrganizationDisabled: 'Khoá doanh nghiệp',
  ProductRegistered: 'Đăng ký sản phẩm',
  ProductStateChanged: 'Chuyển trạng thái',
  CustodyHandoverInitiated: 'Gửi hàng',
  CustodyHandoverCancelled: 'Huỷ gửi hàng',
  CustodyHandoverRejected: 'Từ chối nhận hàng',
  CustodyTransferred: 'Đổi bên giữ hàng',
  OwnershipTransferred: 'Đổi chủ sở hữu',
  WarrantyActivated: 'Kích hoạt bảo hành',
  WarrantySuspended: 'Tạm dừng bảo hành',
  WarrantyResumed: 'Tiếp tục bảo hành',
  ServiceTicketOpened: 'Mở phiếu sửa chữa',
  ServiceTicketClosed: 'Đóng phiếu sửa chữa',
  InspectionRecorded: 'Ghi kết quả kiểm định',
  ProductRecalled: 'Nhà sản xuất thu hồi',
  ProductReportedLostStolen: 'Chủ sở hữu báo mất',
  ProductRetired: 'Chủ sở hữu ngừng sử dụng',
  TransferRequested: 'Gửi yêu cầu chuyển nhượng',
  TransferAccepted: 'Bên nhận chấp nhận chuyển nhượng',
  TransferRejected: 'Bên nhận từ chối chuyển nhượng',
  TransferCancelled: 'Huỷ yêu cầu chuyển nhượng',
  TransferExpired: 'Đóng yêu cầu chuyển nhượng hết hạn',
};

function stateName(value: string | number | boolean | undefined): string {
  const state = typeof value === 'number' ? decodeChainEnum('ProductState', value) : null;
  return state ? PRODUCT_STATE_LABELS[state].label : 'Chưa có';
}

/** Chi tiết thêm của event: số MON, hoặc trạng thái trước → sau (state machine sản phẩm). */
function detailOf(event: ChainEventView): string | null {
  if (event.eventName === 'ProductStateChanged') {
    return `${stateName(event.args.previousState)} → ${stateName(event.args.newState)}`;
  }
  return amountOf(event);
}

export function chainEventLabel(eventName: string): string {
  return EVENT_LABELS[eventName] ?? eventName;
}

/** Số MON đi kèm event (phí nộp, hoàn, chuyển Treasury). */
function amountOf(event: ChainEventView): string | null {
  const amount = event.args.amount;
  return typeof amount === 'string' && /^\d+$/.test(amount)
    ? `${formatMon(BigInt(amount))} MON`
    : null;
}

/** Nhật ký event đã chốt trên blockchain, cũ nhất trước; mỗi dòng mở được giao dịch trên explorer. */
export function ChainLog({ events, chainId }: { events: ChainEventView[]; chainId: number }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted">Chưa có giao dịch nào được ghi nhận.</p>;
  }
  return (
    <ol className="divide-y divide-line">
      {events.map((event) => {
        const amount = detailOf(event);
        return (
          <li
            key={`${event.txHash}-${event.logIndex}`}
            className="grid gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[9rem_minmax(0,1fr)_auto]"
          >
            <p className="text-sm text-muted tabular-nums">
              {formatDate(event.blockTimestamp)} {formatTime(event.blockTimestamp)}
            </p>
            <div className="min-w-0">
              <p className="font-medium">
                {chainEventLabel(event.eventName)}
                {amount ? (
                  <span className="ml-2 font-normal text-muted tabular-nums">{amount}</span>
                ) : null}
              </p>
              {event.actorAddress ? (
                <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
                  Ví gửi <ChainLink chainId={chainId} value={event.actorAddress} kind="address" />
                </p>
              ) : null}
            </div>
            <div className="grid content-start gap-0.5 text-sm sm:justify-items-end">
              <ChainLink chainId={chainId} value={event.txHash} kind="tx" />
              <span className="text-muted tabular-nums">Block {event.blockNumber}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
