import type { ServiceTicketFilter } from '@dpp/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { getIdentity } from '@/features/auth/get-identity';
import { coverageText } from '@/features/service/service-record';
import { myServiceTicketsSchema } from '@/features/service/service.schema';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { serverGet } from '@/lib/server-api';
import { ORGANIZATION_STAGE_LABELS, SERVICE_STATE_LABELS } from '@/lib/state-labels';

export const metadata: Metadata = { title: 'Bảo hành' };

const PAGE_SIZE = 20;
const FILTERS: readonly { id: ServiceTicketFilter; label: string; empty: string }[] = [
  { id: 'REQUESTED', label: 'Chờ tiếp nhận', empty: 'Không có yêu cầu nào đang chờ.' },
  { id: 'IN_REPAIR', label: 'Đang sửa', empty: 'Không có phiếu nào đang sửa.' },
  { id: 'CLOSED', label: 'Đã đóng', empty: 'Chưa đóng phiếu nào.' },
];

function readFilter(value: string | string[] | undefined): ServiceTicketFilter {
  return FILTERS.find((filter) => filter.id === value)?.id ?? 'REQUESTED';
}

function readPage(value: string | string[] | undefined): number {
  const page = typeof value === 'string' ? Number.parseInt(value, 10) : 1;
  return Number.isFinite(page) && page > 0 ? page : 1;
}

/** Yêu cầu bảo hành gửi tới trung tâm mà người dùng đại diện, chia theo trạng thái phiếu. */
export default async function ServiceTicketsPage({
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
    `/me/service-tickets?filter=${filter}&page=${page}&pageSize=${PAGE_SIZE}`,
    myServiceTicketsSchema,
  );
  const center = view?.serviceCenter ?? null;
  const wallet = identity.wallets.find((candidate) => candidate.status === 'ACTIVE')?.address;
  const ready = center?.authStatus === 'AUTHORIZED' && !!view?.contract;
  const pages = view ? Math.max(1, Math.ceil(view.total / PAGE_SIZE)) : 1;
  const current = FILTERS.find((item) => item.id === filter);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-sm text-muted">Bảo hành</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">
        {center?.name ?? 'Phiếu sửa chữa của trung tâm'}
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        Chủ sở hữu chọn trung tâm và gửi yêu cầu trên web. Tiếp nhận thì phiếu được mở trên
        blockchain (còn bảo hành thì bảo hành tạm dừng); đóng phiếu thì hash biên bản được ghi lại.
      </p>

      {view === null ? (
        <Panel className="mt-8 px-5 py-6">
          <p className="font-medium text-bad">Không tải được danh sách phiếu từ API.</p>
          <p className="mt-1 text-sm text-muted">Kiểm tra API đang chạy rồi tải lại trang.</p>
        </Panel>
      ) : !ready ? (
        <Panel className="mt-8 grid gap-4 px-5 py-6">
          <p>
            {!view.contract
              ? 'Hệ thống chưa cấu hình ServiceTicketManager (SERVICE_TICKET_MANAGER_ADDRESS) nên chưa tiếp nhận bảo hành được.'
              : !center
                ? 'Chỉ người đại diện của trung tâm bảo hành mới có trang này. Đăng ký doanh nghiệp với loại "Trung tâm bảo hành" và chờ quản trị viên duyệt.'
                : `Doanh nghiệp đang ở trạng thái "${ORGANIZATION_STAGE_LABELS[center.authStatus].label}". Trang này dùng được sau khi quản trị viên duyệt.`}
          </p>
          {view.contract ? (
            <ButtonLink href="/organization" variant="secondary" className="justify-self-start">
              Mở trang Doanh nghiệp
            </ButtonLink>
          ) : null}
        </Panel>
      ) : (
        <div className="mt-8 grid gap-5">
          <nav aria-label="Lọc phiếu" className="flex flex-wrap gap-1.5">
            {FILTERS.map((item) => (
              <Link
                key={item.id}
                href={{ pathname: '/service', query: { filter: item.id } }}
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
          {!wallet ? (
            <p className="text-sm text-warn">
              Liên kết ví MetaMask ở trang Tài khoản trước: ví cá nhân của bạn ký giao dịch mở và
              đóng phiếu.
            </p>
          ) : null}

          {view.items.length === 0 ? (
            <Panel className="px-5 py-8 text-center">
              <p className="font-medium">{current?.empty}</p>
            </Panel>
          ) : (
            <ul className="divide-y divide-line rounded-control border border-line">
              {view.items.map((item) => {
                const state = SERVICE_STATE_LABELS[item.state];
                const date = item.closedAt ?? item.openedAt ?? item.requestedAt;
                return (
                  <li
                    key={item.id}
                    className="grid gap-2 px-4 py-3.5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_auto] sm:items-center sm:gap-4"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/service/${item.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {item.product.modelName}
                      </Link>
                      <p className="font-mono text-[13px] break-all text-muted">
                        {item.product.serialNumber}
                      </p>
                    </div>
                    <div className="min-w-0 text-sm">
                      <p className="line-clamp-2">{item.issueDesc}</p>
                      <p className="text-muted">
                        {item.product.issuer.name} · {formatDate(date)}
                        {coverageText(item.warrantyCovered)
                          ? ` · ${coverageText(item.warrantyCovered)}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <Badge tone={state.tone} dot>
                        {state.label}
                      </Badge>
                      <ButtonLink
                        href={`/service/${item.id}`}
                        size="sm"
                        variant={item.state === 'REQUESTED' ? 'primary' : 'secondary'}
                      >
                        {item.state === 'REQUESTED'
                          ? 'Tiếp nhận'
                          : item.state === 'IN_REPAIR'
                            ? 'Ghi kết quả'
                            : 'Xem'}
                      </ButtonLink>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {pages > 1 ? (
            <nav aria-label="Phân trang" className="flex items-center justify-between text-sm">
              {page > 1 ? (
                <Link
                  href={{ pathname: '/service', query: { filter, page: String(page - 1) } }}
                  className="font-medium text-tint-ink hover:underline"
                >
                  ← Trang trước
                </Link>
              ) : (
                <span />
              )}
              <span className="text-muted tabular-nums">
                Trang {page}/{pages} · {view.total} phiếu
              </span>
              {page < pages ? (
                <Link
                  href={{ pathname: '/service', query: { filter, page: String(page + 1) } }}
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
