import type { ManufacturerInfo } from '@dpp/shared';
import { ButtonLink } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { ORGANIZATION_STAGE_LABELS } from '@/lib/state-labels';

/** Giải thích vì sao chưa đăng ký được sản phẩm và chỉ đúng bước cần làm tiếp. */
export function ManufacturerNotice({
  manufacturer,
  contractReady,
}: {
  manufacturer: ManufacturerInfo | null;
  contractReady: boolean;
}) {
  const message = !contractReady
    ? 'Hệ thống chưa cấu hình ProductPassport (PRODUCT_PASSPORT_ADDRESS) nên chưa đăng ký được sản phẩm.'
    : !manufacturer
      ? 'Chỉ người đại diện của nhà sản xuất mới đăng ký được sản phẩm. Đăng ký doanh nghiệp với loại "Nhà sản xuất" và chờ quản trị viên duyệt.'
      : `Doanh nghiệp đang ở trạng thái "${ORGANIZATION_STAGE_LABELS[manufacturer.authStatus].label}". Sản phẩm đăng ký được sau khi quản trị viên duyệt.`;
  return (
    <Panel className="mt-8 grid gap-4 px-5 py-6">
      <p>{message}</p>
      {contractReady ? (
        <ButtonLink href="/organization" variant="secondary" className="justify-self-start">
          Mở trang Doanh nghiệp
        </ButtonLink>
      ) : null}
    </Panel>
  );
}
