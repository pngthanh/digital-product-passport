import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Panel } from '@/components/ui/panel';
import { getIdentity } from '@/features/auth/get-identity';
import { ManufacturerNotice } from '@/features/products/manufacturer-notice';
import { myProductListSchema } from '@/features/products/product.schema';
import { RegisterTabs } from '@/features/products/register-tabs';
import { serverChainId } from '@/lib/env';
import { serverGet } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Đăng ký sản phẩm' };

/** PRD-01, PRD-02: nhà sản xuất đã duyệt đăng ký sản phẩm bằng ví cá nhân của người đại diện. */
export default async function NewProductPage() {
  const identity = await getIdentity();
  if (!identity) {
    redirect('/login');
  }
  const view = await serverGet('/me/products?pageSize=1', myProductListSchema);
  const manufacturer = view?.manufacturer ?? null;
  const ready = manufacturer?.authStatus === 'AUTHORIZED' && view?.contract;
  const wallet = identity.wallets.find((candidate) => candidate.status === 'ACTIVE');

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href="/products"
        className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
      >
        ← Sản phẩm
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Đăng ký sản phẩm</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Hồ sơ được lưu, cấp mã QR riêng, rồi ví cá nhân của bạn ghi lên ProductPassport và tự trả
        gas. Một lô CSV chỉ cần ký một lần.
      </p>

      {view === null ? (
        <Panel className="mt-8 px-5 py-6">
          <p className="font-medium text-bad">Không tải được thông tin từ API.</p>
        </Panel>
      ) : !ready ? (
        <ManufacturerNotice manufacturer={manufacturer} contractReady={view.contract !== null} />
      ) : !wallet ? (
        <Panel className="mt-8 px-5 py-6">
          <p>Liên kết ví MetaMask ở trang Tài khoản trước; ví này ký giao dịch đăng ký sản phẩm.</p>
        </Panel>
      ) : (
        <Panel className="mt-8 px-5 py-5">
          <RegisterTabs chainId={serverChainId()} />
        </Panel>
      )}
    </div>
  );
}
