import { ButtonLink } from '@/components/ui/button';
import { LifecycleOverview } from '@/features/lifecycle/lifecycle-overview';
import { WritePermissions } from '@/features/lifecycle/write-permissions';
import { SpecimenPassport } from '@/features/passport-specimen/specimen-passport';

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="grid items-start gap-12 py-14 lg:grid-cols-[minmax(0,1fr)_28rem] lg:py-20">
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
            <ButtonLink href="/system/status">Xem trạng thái hệ thống</ButtonLink>
            <ButtonLink href="/ui-kit" variant="secondary">
              Mở bộ giao diện
            </ButtonLink>
          </div>
          <p className="mt-10 text-sm text-muted">
            Hồ sơ bên cạnh là dữ liệu minh hoạ theo kịch bản trong tài liệu phân tích, chưa ghi lên
            blockchain.
          </p>
        </div>
        <SpecimenPassport />
      </section>

      <section className="border-t border-line py-14">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight">Bốn vòng đời tách biệt</h2>
          <p className="mt-3 text-muted">
            Sản phẩm, bảo hành, phiếu dịch vụ và yêu cầu chuyển quyền có trạng thái riêng, nên một
            chiếc máy có thể vừa đã có chủ, vừa còn bảo hành, vừa đang sửa. Chủ sở hữu là một trường
            dữ liệu, không phải một trạng thái.
          </p>
        </div>
        <div className="mt-8">
          <LifecycleOverview />
        </div>
      </section>

      <section className="border-t border-line py-14">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight">Ai được ghi gì</h2>
          <p className="mt-3 text-muted">
            Smart Contract kiểm tra vai trò trước mỗi lần ghi. Trung tâm bảo hành không sửa được dữ
            liệu của nhà sản xuất, và chủ sở hữu không xoá được lịch sử sửa chữa trước khi bán lại.
          </p>
        </div>
        <div className="mt-8">
          <WritePermissions />
        </div>
      </section>
    </div>
  );
}
