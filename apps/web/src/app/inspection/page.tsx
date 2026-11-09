import type { InspectionFilter } from '@dpp/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { getIdentity } from '@/features/auth/get-identity';
import { myInspectionsSchema } from '@/features/inspection/inspection.schema';
import { InspectionResultBadge } from '@/features/inspection/inspection-report';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { serverGet } from '@/lib/server-api';
import { INSPECTION_REQUEST_STATE_LABELS, ORGANIZATION_STAGE_LABELS } from '@/lib/state-labels';

export const metadata: Metadata = { title: 'Kiểm định' };

const PAGE_SIZE = 20;
const FILTERS: readonly { id: InspectionFilter; label: string; empty: string }[] = [
  { id: 'REQUESTED', label: 'Chờ kiểm định', empty: 'Không có yêu cầu nào đang chờ.' },
  { id: 'COMPLETED', label: 'Đã có kết quả', empty: 'Chưa ghi kết quả nào.' },
  { id: 'CLOSED', label: 'Từ chối, huỷ', empty: 'Không có yêu cầu nào bị từ chối hay huỷ.' },
];

function readFilter(value: string | string[] | undefined): InspectionFilter {
  return FILTERS.find((filter) => filter.id === value)?.id ?? 'REQUESTED';
}

function readPage(value: string | string[] | undefined): number {
  const page = typeof value === 'string' ? Number.parseInt(value, 10) : 1;
  return Number.isFinite(page) && page > 0 ? page : 1;
}

/** Yêu cầu kiểm định gửi tới đơn vị mà người dùng đại diện, chia theo trạng thái. */
export default async function InspectionsPage({
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
    `/me/inspections?filter=${filter}&page=${page}&pageSize=${PAGE_SIZE}`,
    myInspectionsSchema,
  );
  const inspector = view?.inspector ?? null;
  const wallet = identity.wallets.find((candidate) => candidate.status === 'ACTIVE')?.address;
  const ready = inspector?.authStatus === 'AUTHORIZED' && !!view?.contract;
  const pages = view ? Math.max(1, Math.ceil(view.total / PAGE_SIZE)) : 1;
  const current = FILTERS.find((item) => item.id === filter);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-sm text-muted">Kiểm định</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">
        {inspector?.name ?? 'Yêu cầu kiểm định'}
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        Nhà sản xuất hoặc chủ sở hữu gửi yêu cầu trên web. Ghi kết quả thì kết luận và hash biên bản
        được ghi lên blockchain, hiện công khai trên hộ chiếu sản phẩm.
      </p>

      {view === null ? (
        <Panel className="mt-8 px-5 py-6">
          <p className="font-medium text-bad">Không tải được danh sách yêu cầu từ API.</p>
          <p className="mt-1 text-sm text-muted">Kiểm tra API đang chạy rồi tải lại trang.</p>
        </Panel>
      ) : !ready ? (
        <Panel className="mt-8 grid gap-4 px-5 py-6">
          <p>
            {!view.contract
              ? 'Hệ thống chưa cấu hình InspectionRegistry (INSPECTION_REGISTRY_ADDRESS) nên chưa kiểm định được.'
              : !inspector
                ? 'Chỉ người đại diện của đơn vị kiểm định mới có trang này. Đăng ký doanh nghiệp với loại "Đơn vị kiểm định" và chờ quản trị viên duyệt.'
                : `Doanh nghiệp đang ở trạng thái "${ORGANIZATION_STAGE_LABELS[inspector.authStatus].label}". Trang này dùng được sau khi quản trị viên duyệt.`}
          </p>
          {view.contract ? (
            <ButtonLink href="/organization" variant="secondary" className="justify-self-start">
              Mở trang Doanh nghiệp
            </ButtonLink>
          ) : null}
        </Panel>
      ) : (
        <div className="mt-8 grid gap-5">
          <nav aria-label="Lọc yêu cầu" className="flex flex-wrap gap-1.5">
            {FILTERS.map((item) => (
              <Link
                key={item.id}
                href={{ pathname: '/inspection', query: { filter: item.id } }}
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
              Liên kết ví MetaMask ở trang Tài khoản trước: ví cá nhân của bạn ký giao dịch ghi kết
              quả kiểm định.
            </p>
          ) : null}

          {view.items.length === 0 ? (
            <Panel className="px-5 py-8 text-center">
              <p className="font-medium">{current?.empty}</p>
            </Panel>
          ) : (
            <ul className="divide-y divide-line rounded-control border border-line">
              {view.items.map((item) => {
                const state = INSPECTION_REQUEST_STATE_LABELS[item.state];
                return (
                  <li
                    key={item.id}
                    className="grid gap-2 px-4 py-3.5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_auto] sm:items-center sm:gap-4"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/inspection/${item.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {item.product.modelName}
                      </Link>
                      <p className="font-mono text-[13px] break-all text-muted">
                        {item.product.serialNumber}
                      </p>
                    </div>
                    <div className="min-w-0 text-sm">
                      <p className="line-clamp-2">{item.note}</p>
                      <p className="text-muted">
                        {item.requesterRole === 'MANUFACTURER' ? 'Nhà sản xuất' : 'Chủ sở hữu'} ·{' '}
                        {item.product.issuer.name} · {formatDate(item.closedAt ?? item.requestedAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      {item.state === 'COMPLETED' && item.report ? (
                        <InspectionResultBadge result={item.report.result} />
                      ) : (
                        <Badge tone={state.tone} dot>
                          {state.label}
                        </Badge>
                      )}
                      <ButtonLink
                        href={`/inspection/${item.id}`}
                        size="sm"
                        variant={item.state === 'REQUESTED' ? 'primary' : 'secondary'}
                      >
                        {item.state === 'REQUESTED' ? 'Kiểm định' : 'Xem'}
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
                  href={{ pathname: '/inspection', query: { filter, page: String(page - 1) } }}
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
                  href={{ pathname: '/inspection', query: { filter, page: String(page + 1) } }}
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
