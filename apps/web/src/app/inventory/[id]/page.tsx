import { formatPublicCode } from '@dpp/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { getIdentity } from '@/features/auth/get-identity';
import { ReceiptActions } from '@/features/distribution/receipt-actions';
import { SaleForm } from '@/features/distribution/sale-form';
import { PassportHistory } from '@/features/passport/passport-history';
import { ProofList } from '@/features/passport/proof-list';
import { inventoryDetailSchema } from '@/features/products/product.schema';
import {
  locationText,
  productStatusLabel,
  warrantyLabel,
} from '@/features/products/product-status';
import { WarrantySummary } from '@/features/warranty/warranty-summary';
import { serverChainId } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { serverGet } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Sản phẩm trong kho' };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-0.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** Một sản phẩm trong kho nhà bán lẻ: nhận hoặc từ chối (DST-02), bán và kích hoạt bảo hành (DST-03). */
export default async function InventoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const identity = await getIdentity();
  if (!identity) {
    redirect('/login');
  }
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    notFound();
  }
  const product = await serverGet(`/me/inventory/${id}`, inventoryDetailSchema);
  if (!product) {
    notFound();
  }
  const chainId = serverChainId();
  const status = productStatusLabel(product);
  const wallet = identity.wallets.find((candidate) => candidate.status === 'ACTIVE')?.address;
  const target =
    wallet && product.proof
      ? {
          chainId,
          contractAddress: product.proof.contractAddress,
          wallet,
          productId: product.id,
          chainProductId: product.chainProductId,
        }
      : null;
  const location = locationText(product);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href={{
          pathname: '/inventory',
          query: {
            filter:
              product.productState === 'IN_DISTRIBUTION'
                ? 'INCOMING'
                : product.productState === 'AT_RETAIL'
                  ? 'IN_STOCK'
                  : 'SOLD',
          },
        }}
        className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
      >
        ← Kho hàng
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{product.modelName}</h1>
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
      </div>
      <p className="mt-1 font-mono text-sm break-all text-muted">{product.serialNumber}</p>
      {location ? <p className="mt-1 text-sm">{location}</p> : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 content-start gap-6">
          {product.productState === 'IN_DISTRIBUTION' ? (
            <Panel className="px-5 py-5" aria-labelledby="nhan-hang">
              <h2 id="nhan-hang" className="font-semibold">
                Nhận hàng
              </h2>
              <p className="mt-1 mb-4 text-sm text-muted">
                {product.issuer.name} đang gửi sản phẩm này tới cửa hàng. Kiểm tra đúng serial và
                model trước khi xác nhận; không đúng thì từ chối để hàng về lại nhà sản xuất.
              </p>
              {target ? (
                <ReceiptActions target={target} leaveAfterReject />
              ) : (
                <p className="text-sm text-warn">Liên kết ví MetaMask ở trang Tài khoản trước.</p>
              )}
            </Panel>
          ) : null}

          {product.productState === 'AT_RETAIL' ? (
            <Panel className="px-5 py-5" aria-labelledby="ban-hang">
              <h2 id="ban-hang" className="font-semibold">
                Bán cho người mua
              </h2>
              <p className="mt-1 mb-4 text-sm text-muted">
                Người mua thành chủ sở hữu trên blockchain; bảo hành{' '}
                {warrantyLabel(product.warrantyMonths).toLowerCase()} do nhà sản xuất đặt, cửa hàng
                không đổi được.
              </p>
              {target ? (
                <SaleForm target={target} />
              ) : (
                <p className="text-sm text-warn">Liên kết ví MetaMask ở trang Tài khoản trước.</p>
              )}
            </Panel>
          ) : null}

          <Panel className="px-5 py-5" aria-labelledby="ho-so">
            <h2 id="ho-so" className="mb-4 font-semibold">
              Hồ sơ sản phẩm
            </h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Item label="Nhà sản xuất">{product.issuer.name}</Item>
              <Item label="Ngày sản xuất">{formatDate(`${product.manufacturedOn}T00:00:00Z`)}</Item>
              <Item label="Bảo hành">{warrantyLabel(product.warrantyMonths)}</Item>
              <Item label="Mã tra cứu">
                <span className="font-mono text-[14px] tracking-wider">
                  {formatPublicCode(product.publicCode)}
                </span>
              </Item>
              {product.soldAt ? <Item label="Ngày bán">{formatDate(product.soldAt)}</Item> : null}
              <div className="sm:col-span-2">
                <Item label="Mô tả">{product.description ?? 'Không có'}</Item>
              </div>
            </dl>
          </Panel>

          <Panel className="py-1" aria-labelledby="hanh-trinh">
            <h2 id="hanh-trinh" className="sr-only">
              Hành trình
            </h2>
            <PassportHistory
              steps={product.journey}
              chainId={chainId}
              className="px-5 py-4"
              heading="Hành trình của sản phẩm"
              headingClassName="font-semibold"
            />
          </Panel>
        </div>

        <div className="grid content-start gap-6">
          <Panel className="px-5 py-5" aria-labelledby="bao-hanh">
            <h2 id="bao-hanh" className="mb-4 font-semibold">
              Bảo hành
            </h2>
            <WarrantySummary
              warranty={product.warranty}
              warrantyMonths={product.warrantyMonths}
              chainId={chainId}
            />
          </Panel>
          {product.proof ? (
            <Panel className="px-5 py-5" aria-labelledby="doi-chieu">
              <h2 id="doi-chieu" className="mb-4 font-semibold">
                Đối chiếu blockchain
              </h2>
              <ProofList proof={product.proof} registered />
            </Panel>
          ) : null}
          <ButtonLink
            href={`/p/${product.publicCode}`}
            variant="secondary"
            className="justify-self-start"
          >
            Xem hộ chiếu công khai
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
