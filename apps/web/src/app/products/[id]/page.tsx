import { formatPublicCode } from '@dpp/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Panel } from '@/components/ui/panel';
import { getIdentity } from '@/features/auth/get-identity';
import { ChainLog } from '@/features/chain-log/chain-log';
import { ProofList } from '@/features/passport/proof-list';
import { DraftActions } from '@/features/products/draft-actions';
import { productDetailSchema } from '@/features/products/product.schema';
import { ProductQr } from '@/features/products/product-qr';
import { productStatusLabel, warrantyLabel } from '@/features/products/product-status';
import { serverChainId } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { publicWebUrl } from '@/lib/public-url';
import { serverGet } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Chi tiết sản phẩm' };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-0.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** Hồ sơ, mã QR, bằng chứng on-chain và lịch sử của một sản phẩm (phía nhà sản xuất). */
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const identity = await getIdentity();
  if (!identity) {
    redirect('/login');
  }
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    notFound();
  }
  const product = await serverGet(`/me/products/${id}`, productDetailSchema);
  if (!product) {
    notFound();
  }
  const chainId = serverChainId();
  const status = productStatusLabel(product);
  const registered = product.syncStatus === 'CONFIRMED';

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href="/products"
        className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
      >
        ← Sản phẩm
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{product.modelName}</h1>
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
      </div>
      <p className="mt-1 font-mono text-sm break-all text-muted">{product.serialNumber}</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 content-start gap-6">
          <Panel className="px-5 py-5" aria-labelledby="ho-so-san-pham">
            <h2 id="ho-so-san-pham" className="mb-4 font-semibold">
              Hồ sơ sản phẩm
            </h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Item label="Tên model">{product.modelName}</Item>
              <Item label="Serial">
                <span className="font-mono text-[14px]">{product.serialNumber}</span>
              </Item>
              <Item label="Ngày sản xuất">{formatDate(`${product.manufacturedOn}T00:00:00Z`)}</Item>
              <Item label="Bảo hành">{warrantyLabel(product.warrantyMonths)}</Item>
              <Item label="Nhà sản xuất">{product.issuer.name}</Item>
              <Item label="Mã tra cứu">
                <span className="font-mono text-[14px] tracking-wider">
                  {formatPublicCode(product.publicCode)}
                </span>
              </Item>
              <div className="sm:col-span-2">
                <Item label="Mô tả">{product.description ?? 'Không có'}</Item>
              </div>
            </dl>
          </Panel>

          {product.proof ? (
            <Panel className="px-5 py-5" aria-labelledby="doi-chieu">
              <h2 id="doi-chieu" className="mb-4 font-semibold">
                Đối chiếu blockchain
              </h2>
              <ProofList proof={product.proof} registered={registered} />
            </Panel>
          ) : null}

          {registered ? (
            <Panel className="px-5 py-5" aria-labelledby="lich-su">
              <h2 id="lich-su" className="font-semibold">
                Lịch sử on-chain
              </h2>
              <p className="mt-1 mb-4 text-sm text-muted">
                Event đã chốt của sản phẩm trên ProductPassport.
              </p>
              <ChainLog events={product.history} chainId={chainId} />
            </Panel>
          ) : null}
        </div>

        <div className="grid content-start gap-6">
          <Panel className="px-5 py-5" aria-labelledby="ma-qr">
            <h2 id="ma-qr" className="mb-4 font-semibold">
              Mã QR của sản phẩm
            </h2>
            <ProductQr
              baseUrl={await publicWebUrl()}
              productId={product.id}
              publicCode={product.publicCode}
              serialNumber={product.serialNumber}
              modelName={product.modelName}
              registered={registered}
            />
          </Panel>
          {product.syncStatus === 'PENDING' ? (
            <Panel className="px-5 py-5" aria-labelledby="ban-nhap">
              <h2 id="ban-nhap" className="mb-3 font-semibold">
                Bản nháp
              </h2>
              <DraftActions productId={product.id} chainId={chainId} />
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
