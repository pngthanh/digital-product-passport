import type { PublicPassportView, PublicVerificationView } from '@dpp/shared';
import { Panel } from '@/components/ui/panel';
import { SelfCheckPanel } from './self-check-panel';
import { VerificationPanel } from './verification-panel';

/**
 * Khung "Đối chiếu blockchain" và "Tự kiểm tra" của hộ chiếu công khai. Trang đặt khung này ngay dưới
 * hộ chiếu trên điện thoại và ở cột phải trên màn hình rộng, nên `idPrefix` giữ id tiêu đề không trùng.
 */
export function VerificationSection({
  verification,
  passport,
  chainId,
  idPrefix,
  className,
}: {
  verification: PublicVerificationView | null;
  passport: PublicPassportView;
  chainId: number;
  idPrefix: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Panel className="px-5 py-5" aria-labelledby={`${idPrefix}-doi-chieu`}>
        <h2 id={`${idPrefix}-doi-chieu`} className="mb-4 font-semibold">
          Đối chiếu blockchain
        </h2>
        <VerificationPanel verification={verification} />
      </Panel>
      {verification?.contracts ? (
        <Panel className="px-5 py-5" aria-labelledby={`${idPrefix}-tu-kiem`}>
          <h2 id={`${idPrefix}-tu-kiem`} className="mb-2 font-semibold">
            Tự kiểm tra
          </h2>
          <SelfCheckPanel
            passport={passport}
            contracts={verification.contracts}
            chainId={chainId}
          />
        </Panel>
      ) : null}
    </div>
  );
}
