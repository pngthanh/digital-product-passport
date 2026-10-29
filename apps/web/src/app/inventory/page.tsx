import type { InventoryFilter } from '@dpp/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ButtonLink } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { getIdentity } from '@/features/auth/get-identity';
import { InventoryList } from '@/features/distribution/inventory-list';
import { myInventorySchema } from '@/features/products/product.schema';
import { cn } from '@/lib/cn';
import { serverChainId } from '@/lib/env';
import { serverGet } from '@/lib/server-api';
import { ORGANIZATION_STAGE_LABELS } from '@/lib/state-labels';

export const metadata: Metadata = { title: 'Kho hàng' };

const PAGE_SIZE = 20;
const FILTERS: readonly { id: InventoryFilter; label: string; empty: string }[] = [
  {
    id: 'INCOMING',
    label: 'Chờ nhận',
    empty: 'Không có lô hàng nào đang được gửi tới cửa hàng.',
  },
  { id: 'IN_STOCK', label: 'Đang bán', empty: 'Cửa hàng chưa có sản phẩm nào để bán.' },
  { id: 'SOLD', label: 'Đã bán', empty: 'Chưa bán sản phẩm nào.' },
];

function readFilter(value: string | string[] | undefined): InventoryFilter {
  return FILTERS.find((filter) => filter.id === value)?.id ?? 'IN_STOCK';
}

function readPage(value: string | string[] | undefined): number {
  const page = typeof value === 'string' ? Number.parseInt(value, 10) : 1;
  return Number.isFinite(page) && page > 0 ? page : 1;
}

/** DST-02, DST-03: kho hàng của nhà bán lẻ mà người dùng đại diện. */
export default async function InventoryPage({
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
    `/me/inventory?filter=${filter}&page=${page}&pageSize=${PAGE_SIZE}`,
    myInventorySchema,
  );
  const retailer = view?.retailer ?? null;
  const wallet = identity.wallets.find((candidate) => candidate.status === 'ACTIVE')?.address;
  const ready = retailer?.authStatus === 'AUTHORIZED' && !!view?.contract;
  const pages = view ? Math.max(1, Math.ceil(view.total / PAGE_SIZE)) : 1;
  const current = FILTERS.find((item) => item.id === filter);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-sm text-muted">Kho hàng</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">
        {retailer?.name ?? 'Kho hàng của cửa hàng'}
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        Hàng nhà sản xuất gửi tới chỉ thuộc cửa hàng khi bạn xác nhận đã nhận. Khi bán, quyền sở hữu
        chuyển cho tài khoản người mua và bảo hành bắt đầu ngay trong giao dịch đó.
      </p>

      {view === null ? (
        <Panel className="mt-8 px-5 py-6">
          <p className="font-medium text-bad">Không tải được kho hàng từ API.</p>
          <p className="mt-1 text-sm text-muted">Kiểm tra API đang chạy rồi tải lại trang.</p>
        </Panel>
      ) : !ready ? (
        <Panel className="mt-8 grid gap-4 px-5 py-6">
          <p>
            {!view.contract
              ? 'Hệ thống chưa cấu hình ProductPassport (PRODUCT_PASSPORT_ADDRESS) nên chưa nhận và bán hàng được.'
              : !retailer
                ? 'Chỉ người đại diện của nhà bán lẻ mới có kho hàng. Đăng ký doanh nghiệp với loại "Nhà bán lẻ" và chờ quản trị viên duyệt.'
                : `Doanh nghiệp đang ở trạng thái "${ORGANIZATION_STAGE_LABELS[retailer.authStatus].label}". Kho hàng dùng được sau khi quản trị viên duyệt.`}
          </p>
          {view.contract ? (
            <ButtonLink href="/organization" variant="secondary" className="justify-self-start">
              Mở trang Doanh nghiệp
            </ButtonLink>
          ) : null}
        </Panel>
      ) : (
        <div className="mt-8 grid gap-5">
          <nav aria-label="Lọc kho hàng" className="flex flex-wrap gap-1.5">
            {FILTERS.map((item) => (
              <Link
                key={item.id}
                href={{ pathname: '/inventory', query: { filter: item.id } }}
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
              Liên kết ví MetaMask ở trang Tài khoản trước: ví cá nhân của bạn ký các giao dịch nhận
              và bán hàng.
            </p>
          ) : null}

          {view.items.length === 0 ? (
            <Panel className="px-5 py-8 text-center">
              <p className="font-medium">{current?.empty}</p>
            </Panel>
          ) : (
            <InventoryList
              items={view.items}
              filter={filter}
              target={
                wallet && view.contract
                  ? { chainId: serverChainId(), contractAddress: view.contract.address, wallet }
                  : null
              }
            />
          )}

          {pages > 1 ? (
            <nav aria-label="Phân trang" className="flex items-center justify-between text-sm">
              {page > 1 ? (
                <Link
                  href={{ pathname: '/inventory', query: { filter, page: String(page - 1) } }}
                  className="font-medium text-tint-ink hover:underline"
                >
                  ← Trang trước
                </Link>
              ) : (
                <span />
              )}
              <span className="text-muted tabular-nums">
                Trang {page}/{pages} · {view.total} sản phẩm
              </span>
              {page < pages ? (
                <Link
                  href={{ pathname: '/inventory', query: { filter, page: String(page + 1) } }}
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
