import type { TransferFilter, TransferRequestView } from '@dpp/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Panel } from '@/components/ui/panel';
import { getIdentity } from '@/features/auth/get-identity';
import { myTransfersSchema } from '@/features/transfer/transfer.schema';
import { TransferActions } from '@/features/transfer/transfer-actions';
import { TransferStateBadge, TransferSummary } from '@/features/transfer/transfer-summary';
import { cn } from '@/lib/cn';
import { serverChainId } from '@/lib/env';
import { serverGet } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Chuyển nhượng' };

const PAGE_SIZE = 20;
const FILTERS: readonly { id: TransferFilter; label: string; empty: string }[] = [
  { id: 'INCOMING', label: 'Gửi tới tôi', empty: 'Không có yêu cầu nào đang chờ bạn chấp nhận.' },
  { id: 'OUTGOING', label: 'Tôi đã gửi', empty: 'Bạn không có yêu cầu nào đang chờ bên nhận.' },
  { id: 'CLOSED', label: 'Đã đóng', empty: 'Chưa có yêu cầu nào đã đóng.' },
];

function readFilter(value: string | string[] | undefined): TransferFilter {
  return FILTERS.find((filter) => filter.id === value)?.id ?? 'INCOMING';
}

function readPage(value: string | string[] | undefined): number {
  const page = typeof value === 'string' ? Number.parseInt(value, 10) : 1;
  return Number.isFinite(page) && page > 0 ? page : 1;
}

/** Người xem đang giữ sản phẩm thì mở trang Đã mua, không thì mở hộ chiếu công khai. */
function holdsProduct(item: TransferRequestView): boolean {
  return (
    (item.direction === 'INCOMING' && item.state === 'COMPLETED') ||
    (item.direction === 'OUTGOING' && item.state !== 'COMPLETED')
  );
}

/**
 * TRF-06: yêu cầu chuyển nhượng gửi tới người dùng (hoặc doanh nghiệp họ đại diện) và do họ gửi.
 * Bên nhận chấp nhận hoặc từ chối bằng ví của mình; bên gửi huỷ được khi bên nhận chưa trả lời.
 */
export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const identity = await getIdentity();
  if (!identity) {
    redirect('/login');
  }
  const params = await searchParams;
  const filter = readFilter(params.filter);
  const page = readPage(params.page);
  const view = await serverGet(
    `/me/transfers?filter=${filter}&page=${page}&pageSize=${PAGE_SIZE}`,
    myTransfersSchema,
  );
  const chainId = serverChainId();
  const pages = view ? Math.max(1, Math.ceil(view.total / PAGE_SIZE)) : 1;
  const current = FILTERS.find((item) => item.id === filter);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-sm text-muted">Chuyển nhượng</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Chuyển quyền sở hữu</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Chủ sở hữu gửi yêu cầu từ trang sản phẩm đã mua. Quyền sở hữu chỉ chuyển khi bên nhận bấm
        chấp nhận bằng ví của mình; bảo hành còn lại đi theo sản phẩm.
      </p>

      {view === null ? (
        <Panel className="mt-8 px-5 py-6">
          <p className="font-medium text-bad">Không tải được danh sách chuyển nhượng từ API.</p>
          <p className="mt-1 text-sm text-muted">Kiểm tra API đang chạy rồi tải lại trang.</p>
        </Panel>
      ) : (
        <div className="mt-8 grid gap-5">
          <nav aria-label="Lọc yêu cầu" className="flex flex-wrap gap-1.5">
            {FILTERS.map((item) => (
              <Link
                key={item.id}
                href={{ pathname: '/transfers', query: { filter: item.id } }}
                aria-current={item.id === filter ? 'page' : undefined}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
                  item.id === filter
                    ? 'border-primary bg-primary font-medium text-primary-ink'
                    : 'border-line-strong text-muted hover:bg-tint hover:text-ink',
                )}
              >
                {item.label}
                <span className="tabular-nums opacity-80">{view.counts[item.id]}</span>
              </Link>
            ))}
          </nav>
          {!view.contract ? (
            <p className="text-sm text-warn">
              Hệ thống chưa cấu hình OwnershipTransfer (OWNERSHIP_TRANSFER_ADDRESS) nên chưa chuyển
              nhượng được.
            </p>
          ) : null}

          {view.items.length === 0 ? (
            <Panel className="px-5 py-8 text-center">
              <p className="font-medium">{current?.empty}</p>
            </Panel>
          ) : (
            <ul className="grid gap-3">
              {view.items.map((item) => (
                <li key={item.id}>
                  <Panel className="grid gap-4 px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={
                            holdsProduct(item)
                              ? `/owned/${item.product.id}`
                              : `/p/${item.product.publicCode}`
                          }
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {item.product.modelName}
                        </Link>
                        <p className="text-sm break-words text-muted">
                          <span className="font-mono text-[13px] break-all">
                            {item.product.serialNumber}
                          </span>{' '}
                          · {item.product.issuer.name}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted">Yêu cầu #{item.requestId}</span>
                        <TransferStateBadge request={item} />
                      </div>
                    </div>
                    <TransferSummary request={item} chainId={chainId} />
                    {item.direction === 'INCOMING' &&
                    item.state === 'REQUESTED' &&
                    !item.expired ? (
                      <p className="text-sm text-muted">
                        Chấp nhận thì sản phẩm thuộc về{' '}
                        {item.to.kind === 'ORGANIZATION' ? 'doanh nghiệp của bạn' : 'bạn'}, bảo hành
                        còn lại đi theo. Từ chối thì sản phẩm vẫn là của bên gửi.
                      </p>
                    ) : null}
                    <TransferActions request={item} contract={view.contract} wallet={view.wallet} />
                  </Panel>
                </li>
              ))}
            </ul>
          )}

          {pages > 1 ? (
            <nav aria-label="Phân trang" className="flex items-center justify-between text-sm">
              {page > 1 ? (
                <Link
                  href={{ pathname: '/transfers', query: { filter, page: String(page - 1) } }}
                  className="font-medium text-tint-ink hover:underline"
                >
                  ← Trang trước
                </Link>
              ) : (
                <span />
              )}
              <span className="text-muted tabular-nums">
                Trang {page}/{pages} · {view.total} yêu cầu
              </span>
              {page < pages ? (
                <Link
                  href={{ pathname: '/transfers', query: { filter, page: String(page + 1) } }}
                  className="font-medium text-tint-ink hover:underline"
                >
                  Trang sau →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </div>
      )}
    </div>
  );
}
