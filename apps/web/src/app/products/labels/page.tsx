import { PRODUCT_BATCH_MAX_SIZE } from '@dpp/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Panel } from '@/components/ui/panel';
import { getIdentity } from '@/features/auth/get-identity';
import { LabelSheet } from '@/features/products/label-sheet';
import { productDetailSchema } from '@/features/products/product.schema';
import { publicWebUrl } from '@/lib/public-url';
import { serverGet } from '@/lib/server-api';

export const metadata: Metadata = { title: 'In tem QR' };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readIds(value: string | string[] | undefined): string[] {
  const raw = typeof value === 'string' ? value.split(',') : [];
  return [...new Set(raw.map((id) => id.trim()).filter((id) => UUID_PATTERN.test(id)))].slice(
    0,
    PRODUCT_BATCH_MAX_SIZE,
  );
}

/** In tem QR cho các sản phẩm đã ghi lên blockchain (chọn từ danh sách hoặc ngay sau khi nhập lô). */
export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const identity = await getIdentity();
  if (!identity) {
    redirect('/login');
  }
  const ids = readIds((await searchParams).ids);
  const details = await Promise.all(
    ids.map((id) => serverGet(`/me/products/${id}`, productDetailSchema)),
  );
  const products = details.filter(
    (detail): detail is NonNullable<typeof detail> => detail?.syncStatus === 'CONFIRMED',
  );
  const skipped = ids.length - products.length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 print:max-w-none print:p-0">
      <div className="print:hidden">
        <Link
          href="/products"
          className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          ← Sản phẩm
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">In tem QR</h1>
        {skipped > 0 ? (
          <p className="mt-2 text-sm text-warn">
            Bỏ qua {skipped} sản phẩm chưa ghi lên blockchain hoặc không thuộc doanh nghiệp của bạn.
          </p>
        ) : null}
      </div>
      {products.length === 0 ? (
        <Panel className="mt-8 px-5 py-6 print:hidden">
          <p>
            Chưa chọn sản phẩm nào đã ghi lên blockchain. Chọn sản phẩm ở danh sách rồi bấm In tem.
          </p>
        </Panel>
      ) : (
        <div className="mt-6 print:mt-0">
          <LabelSheet
            products={products}
            baseUrl={await publicWebUrl()}
            issuerName={products[0]?.issuer.name ?? ''}
          />
        </div>
      )}
    </div>
  );
}
