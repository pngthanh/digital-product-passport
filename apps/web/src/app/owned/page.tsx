import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Panel } from '@/components/ui/panel';
import { getIdentity } from '@/features/auth/get-identity';
import { ownedProductsSchema } from '@/features/products/product.schema';
import { daysLeft } from '@/features/warranty/warranty-summary';
import { formatDate } from '@/lib/format';
import { serverGet } from '@/lib/server-api';
import { WARRANTY_STATE_LABELS } from '@/lib/state-labels';

export const metadata: Metadata = { title: 'Sản phẩm đã mua' };

/** Sản phẩm tài khoản đang sở hữu (sau khi nhà bán lẻ bán cho bạn) kèm tình trạng bảo hành. */
export default async function OwnedProductsPage() {
  const identity = await getIdentity();
  if (!identity) {
    redirect('/login');
  }
  const items = await serverGet('/me/owned-products', ownedProductsSchema);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-sm text-muted">Đã mua</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Sản phẩm của bạn</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Khi mua hàng, đưa cửa hàng email tài khoản này ({identity.account.email}). Quyền sở hữu và
        bảo hành ghi trên blockchain gắn với tài khoản, chưa cần ví MetaMask.
      </p>

      {items === null ? (
        <Panel className="mt-8 px-5 py-6">
          <p className="font-medium text-bad">Không tải được danh sách từ API.</p>
        </Panel>
      ) : items.length === 0 ? (
        <Panel className="mt-8 px-5 py-8 text-center">
          <p className="font-medium">Chưa có sản phẩm nào.</p>
          <p className="mt-1 text-sm text-muted">
            Sản phẩm hiện ở đây ngay khi giao dịch bán của cửa hàng được ghi lên blockchain.
          </p>
        </Panel>
      ) : (
        <ul className="mt-8 grid gap-3">
          {items.map((item) => {
            const warranty = item.warranty ? WARRANTY_STATE_LABELS[item.warranty.state] : null;
            return (
              <li key={item.id}>
                <Panel className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <Link
                      href={`/owned/${item.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {item.modelName}
                    </Link>
                    <p className="font-mono text-[13px] break-all text-muted">
                      {item.serialNumber}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {item.issuer.name} · mua ngày {formatDate(item.acquiredAt)}
                    </p>
                  </div>
                  <div className="grid justify-items-start gap-1 sm:justify-items-end">
                    {warranty && item.warranty ? (
                      <>
                        <Badge tone={warranty.tone} dot>
                          {warranty.label}
                        </Badge>
                        <p className="text-[13px] text-muted">
                          {item.warranty.state === 'ACTIVE'
                            ? `Đến ${formatDate(item.warranty.expiresAt)} · còn ${daysLeft(item.warranty.expiresAt)} ngày`
                            : `Hết hạn ${formatDate(item.warranty.expiresAt)}`}
                        </p>
                      </>
                    ) : (
                      <Badge tone="neutral">Không bảo hành</Badge>
                    )}
                  </div>
                </Panel>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
