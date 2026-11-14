import { extractPublicCode, formatPublicCode } from '@dpp/shared';
import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { publicInspectionsSchema } from '@/features/inspection/inspection.schema';
import { PublicInspections } from '@/features/inspection/public-inspections';
import { publicLifecycleSchema } from '@/features/lifecycle/lifecycle.schema';
import { LifecycleNoticeBanner } from '@/features/lifecycle/lifecycle-notice';
import { PassportCard } from '@/features/passport/passport-card';
import { ProofList } from '@/features/passport/proof-list';
import { publicPassportSchema } from '@/features/products/product.schema';
import { serverChainId } from '@/lib/env';
import { serverGet } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Hộ chiếu sản phẩm' };

/**
 * Hộ chiếu công khai mà mã QR trên tem trỏ tới: ai cũng xem được, không cần đăng nhập. Dữ liệu
 * được đối chiếu trực tiếp với ProductPassport mỗi lần tải trang.
 */
export default async function PassportPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = extractPublicCode(decodeURIComponent(raw));
  const [passport, inspections, lifecycle] = code
    ? await Promise.all([
        serverGet(`/public/products/${code}`, publicPassportSchema),
        serverGet(`/public/products/${code}/inspections`, publicInspectionsSchema),
        serverGet(`/public/products/${code}/lifecycle`, publicLifecycleSchema),
      ])
    : [null, null, null];

  if (!passport) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
        <Panel className="grid gap-4 px-5 py-6">
          <h1 className="text-xl font-semibold">Không tìm thấy hộ chiếu</h1>
          <p className="text-muted">
            {code
              ? `Không có sản phẩm nào đã ghi lên blockchain với mã ${formatPublicCode(code)}. Kiểm tra lại mã trên tem; tem của sản phẩm chưa ghi lên blockchain chưa tra cứu được.`
              : 'Mã tra cứu gồm 12 ký tự in dưới mã QR trên tem.'}
          </p>
          <ButtonLink href="/lookup" variant="secondary" className="justify-self-start">
            Tra cứu mã khác
          </ButtonLink>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 content-start gap-6">
          {lifecycle?.notice ? (
            <LifecycleNoticeBanner
              notice={lifecycle.notice}
              chainId={serverChainId()}
              audience="public"
            />
          ) : null}
          <PassportCard passport={passport} />
          <Panel className="px-5 py-5" aria-labelledby="kiem-dinh">
            <h2 id="kiem-dinh" className="mb-1 font-semibold">
              Kết quả kiểm định
            </h2>
            <p className="mb-4 text-sm text-muted">
              Do đơn vị kiểm định đã được duyệt ghi lên blockchain; file biên bản được băm lại mỗi
              lần tải trang để đối chiếu.
            </p>
            {inspections ? (
              <PublicInspections items={inspections.items} chainId={serverChainId()} />
            ) : (
              <p className="text-sm text-bad">Không tải được kết quả kiểm định từ API.</p>
            )}
          </Panel>
        </div>
        <div className="grid content-start gap-6">
          <Panel className="px-5 py-5" aria-labelledby="doi-chieu">
            <h2 id="doi-chieu" className="mb-4 font-semibold">
              Đối chiếu blockchain
            </h2>
            <ProofList proof={passport.proof} registered />
          </Panel>
          {passport.description ? (
            <Panel className="px-5 py-5" aria-labelledby="mo-ta">
              <h2 id="mo-ta" className="mb-2 font-semibold">
                Mô tả của nhà sản xuất
              </h2>
              <p className="text-[15px] whitespace-pre-line">{passport.description}</p>
            </Panel>
          ) : null}
          <ButtonLink href="/lookup" variant="secondary" className="justify-self-start">
            Tra cứu sản phẩm khác
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
