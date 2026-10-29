import { ButtonLink } from '@/components/ui/button';
import { getIdentity } from '@/features/auth/get-identity';
import { SpecimenPassport } from '@/features/passport-specimen/specimen-passport';

export default async function HomePage() {
  const identity = await getIdentity();
  const hasActiveWallet = identity?.wallets.some((wallet) => wallet.status === 'ACTIVE') ?? false;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="grid items-start gap-12 py-14 lg:grid-cols-[minmax(0,1fr)_30rem] lg:py-20">
        <div className="max-w-xl lg:pt-6">
          <h1 className="text-4xl leading-[1.15] font-semibold tracking-tight text-balance sm:text-5xl">
            Lịch sử của mỗi sản phẩm, ghi một lần và ai cũng kiểm chứng được.
          </h1>
          <p className="mt-6 text-[17px] leading-8 text-muted">
            Hộ chiếu số theo một sản phẩm từ lúc xuất xưởng, qua cửa hàng, bảo hành, sửa chữa tới
            từng lần đổi chủ. Mỗi sự kiện do đúng đơn vị có thẩm quyền ghi lên Monad, và người mua
            sau có thể đối chiếu bằng mã giao dịch.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/lookup">Tra cứu bằng mã QR</ButtonLink>
            {identity ? (
              <>
                <ButtonLink href="/account" variant="secondary">
                  {hasActiveWallet ? 'Xem tài khoản' : 'Liên kết ví MetaMask'}
                </ButtonLink>
                {hasActiveWallet ? (
                  <ButtonLink href="/organization" variant="secondary">
                    Doanh nghiệp
                  </ButtonLink>
                ) : null}
              </>
            ) : (
              <>
                <ButtonLink href="/register" variant="secondary">
                  Tạo tài khoản
                </ButtonLink>
                <ButtonLink href="/login" variant="secondary">
                  Đăng nhập
                </ButtonLink>
              </>
            )}
          </div>
          <p className="mt-10 text-sm text-muted">
            Hồ sơ bên cạnh là dữ liệu minh hoạ theo kịch bản trong tài liệu phân tích, chưa ghi lên
            blockchain.
          </p>
        </div>
        <SpecimenPassport />
      </section>
    </div>
  );
}
