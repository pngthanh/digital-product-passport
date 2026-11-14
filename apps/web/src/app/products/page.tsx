import type { ProductListFilter } from '@dpp/shared';
import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ButtonLink } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Panel } from '@/components/ui/panel';
import { getIdentity } from '@/features/auth/get-identity';
import { ManufacturerNotice } from '@/features/products/manufacturer-notice';
import { myProductListSchema } from '@/features/products/product.schema';
import { ProductTable } from '@/features/products/product-table';
import { cn } from '@/lib/cn';
import { serverChainId } from '@/lib/env';
import { serverGet } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Sản phẩm' };

const PAGE_SIZE = 20;
const FILTERS: readonly { id: ProductListFilter; label: string }[] = [
  { id: 'ALL', label: 'Tất cả' },
  { id: 'REGISTERED', label: 'Đã ghi lên blockchain' },
  { id: 'DRAFT', label: 'Bản nháp' },
  { id: 'RECALLED', label: 'Đã thu hồi' },
];

function readFilter(value: string | string[] | undefined): ProductListFilter {
  return FILTERS.find((filter) => filter.id === value)?.id ?? 'ALL';
}

function readText(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value.trim().slice(0, 100) : '';
}

function readPage(value: string | string[] | undefined): number {
  const page = typeof value === 'string' ? Number.parseInt(value, 10) : 1;
  return Number.isFinite(page) && page > 0 ? page : 1;
}

/** Sản phẩm của nhà sản xuất mà người dùng đại diện: lọc, tìm, in tem QR, gửi lại bản nháp. */
export default async function ProductsPage({
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
  const search = readText(params.q);
  const page = readPage(params.page);
  const query = new URLSearchParams({
    filter,
    page: String(page),
    pageSize: String(PAGE_SIZE),
    ...(search ? { q: search } : {}),
  });
  const view = await serverGet(`/me/products?${query.toString()}`, myProductListSchema);
  const manufacturer = view?.manufacturer ?? null;
  const pages = view ? Math.max(1, Math.ceil(view.total / PAGE_SIZE)) : 1;
  const linkTo = (next: Record<string, string>) => ({
    pathname: '/products' as const,
    query: { filter, ...(search ? { q: search } : {}), ...next },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-sm text-muted">Sản phẩm</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          {manufacturer?.name ?? 'Sản phẩm của doanh nghiệp'}
        </h1>
        {manufacturer?.authStatus === 'AUTHORIZED' && view?.contract ? (
          <ButtonLink href="/products/new">
            <Plus aria-hidden className="size-4" />
            Đăng ký sản phẩm
          </ButtonLink>
        ) : null}
      </div>
      <p className="mt-2 max-w-2xl text-muted">
        Mỗi sản phẩm có một mã QR riêng trỏ tới hộ chiếu công khai. Hồ sơ đã ghi lên blockchain thì
        không sửa hay xoá được; sản phẩm lỗi thì chọn rồi bấm Thu hồi.
      </p>

      {view === null ? (
        <Panel className="mt-8 px-5 py-6">
          <p className="font-medium text-bad">Không tải được danh sách sản phẩm từ API.</p>
          <p className="mt-1 text-sm text-muted">Kiểm tra API đang chạy rồi tải lại trang.</p>
        </Panel>
      ) : !manufacturer || manufacturer.authStatus !== 'AUTHORIZED' || !view.contract ? (
        <ManufacturerNotice manufacturer={manufacturer} contractReady={view.contract !== null} />
      ) : (
        <div className="mt-8 grid gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Lọc sản phẩm" className="flex flex-wrap gap-1.5">
              {FILTERS.map((item) => (
                <Link
                  key={item.id}
                  href={{
                    pathname: '/products',
                    query: { filter: item.id, ...(search ? { q: search } : {}) },
                  }}
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
            <form action="/products" className="flex w-full gap-2 sm:w-auto">
              <input type="hidden" name="filter" value={filter} />
              <Input
                name="q"
                defaultValue={search}
                placeholder="Tìm serial, model hoặc mã QR"
                aria-label="Tìm sản phẩm"
                className="sm:w-72"
              />
              <button
                type="submit"
                className="h-10 shrink-0 rounded-control border border-line-strong px-4 text-sm font-medium hover:bg-tint"
              >
                Tìm
              </button>
            </form>
          </div>

          {view.items.length === 0 ? (
            <Panel className="px-5 py-8 text-center">
              <p className="font-medium">
                {search ? 'Không có sản phẩm nào khớp từ khoá.' : 'Chưa có sản phẩm nào.'}
              </p>
              {!search && filter !== 'DRAFT' ? (
                <p className="mt-1 text-sm text-muted">
                  Đăng ký từng sản phẩm hoặc nhập cả lô bằng file CSV.
                </p>
              ) : null}
            </Panel>
          ) : (
            <ProductTable
              key={`${filter}-${search}-${page}`}
              items={view.items}
              chainId={serverChainId()}
            />
          )}

          {pages > 1 ? (
            <nav aria-label="Phân trang" className="flex items-center justify-between text-sm">
              {page > 1 ? (
                <Link
                  href={linkTo({ page: String(page - 1) })}
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
                  href={linkTo({ page: String(page + 1) })}
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
