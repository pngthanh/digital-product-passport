import { extractPublicCode, formatPublicCode } from '@dpp/shared';
import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { ChainLog } from '@/features/chain-log/chain-log';
import { publicInspectionsSchema } from '@/features/inspection/inspection.schema';
import { PublicInspections } from '@/features/inspection/public-inspections';
import { publicLifecycleSchema } from '@/features/lifecycle/lifecycle.schema';
import { LifecycleNoticeBanner } from '@/features/lifecycle/lifecycle-notice';
import { PassportCard } from '@/features/passport/passport-card';
import { ProofList } from '@/features/passport/proof-list';
import { publicPassportSchema } from '@/features/products/product.schema';
import { VerificationSection } from '@/features/verification/verification-section';
import { publicVerificationSchema } from '@/features/verification/verification.schema';
import { serverChainId } from '@/lib/env';
import { serverFetch, serverGet } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Hộ chiếu sản phẩm' };

const TOO_MANY_REQUESTS = 429;

function NotFound({ code, limited }: { code: string | null; limited: boolean }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
      <Panel className="grid gap-4 px-5 py-6">
        <h1 className="text-xl font-semibold">
          {limited ? 'Bạn tra cứu quá nhanh' : 'Không tìm thấy hộ chiếu'}
        </h1>
        <p className="text-muted">
          {limited
            ? 'Hệ thống giới hạn số lần tra cứu mỗi phút để chống dò mã. Đợi một phút rồi tải lại trang.'
            : code
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

/**
 * Hộ chiếu công khai mà mã QR trên tem trỏ tới: ai cũng xem được, không cần đăng nhập.
 * VER-01 (M11): máy chủ đối chiếu từng mục với contract, người xem tự kiểm bằng trình duyệt;
 * VER-02: dòng thời gian và nhật ký giao dịch, mỗi bước mở được trên explorer.
 */
export default async function PassportPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = extractPublicCode(decodeURIComponent(raw));
  if (!code) {
    return <NotFound code={null} limited={false} />;
  }
  const [passportResult, inspections, lifecycle, verification] = await Promise.all([
    serverFetch(`/public/products/${code}`, publicPassportSchema),
    serverGet(`/public/products/${code}/inspections`, publicInspectionsSchema),
    serverGet(`/public/products/${code}/lifecycle`, publicLifecycleSchema),
    serverGet(`/public/products/${code}/verification`, publicVerificationSchema),
  ]);

  if (!passportResult.ok) {
    return <NotFound code={code} limited={passportResult.status === TOO_MANY_REQUESTS} />;
  }
  const passport = passportResult.data;
  const chainId = serverChainId();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 content-start gap-6">
          {lifecycle?.notice ? (
            <LifecycleNoticeBanner notice={lifecycle.notice} chainId={chainId} audience="public" />
          ) : null}
          <PassportCard passport={passport} />
          <VerificationSection
            verification={verification}
            passport={passport}
            chainId={chainId}
            idPrefix="m"
            className="grid gap-6 lg:hidden"
          />
          <Panel className="px-5 py-5" aria-labelledby="kiem-dinh">
            <h2 id="kiem-dinh" className="mb-1 font-semibold">
              Kết quả kiểm định
            </h2>
            <p className="mb-4 text-sm text-muted">
              Do đơn vị kiểm định đã được duyệt ghi lên blockchain; file biên bản được băm lại mỗi
              lần tải trang để đối chiếu.
            </p>
            {inspections ? (
              <PublicInspections items={inspections.items} chainId={chainId} />
            ) : (
              <p className="text-sm text-bad">Không tải được kết quả kiểm định từ API.</p>
            )}
          </Panel>
          <Panel className="px-5 py-5" aria-labelledby="nhat-ky">
            <details>
              <summary className="cursor-pointer font-semibold" id="nhat-ky">
                Nhật ký giao dịch on-chain ({passport.history.length})
              </summary>
              <p className="mt-2 mb-4 text-sm text-muted">
                Mọi event đã chốt của sản phẩm, cũ nhất trước. Ví và mã của người dùng cá nhân được
                ẩn; ví chỉ hiện khi người đại diện ký thay doanh nghiệp.
              </p>
              <ChainLog events={passport.history} chainId={chainId} />
            </details>
          </Panel>
        </div>
        <div className="grid content-start gap-6">
          <VerificationSection
            verification={verification}
            passport={passport}
            chainId={chainId}
            idPrefix="d"
            className="hidden gap-6 lg:grid"
          />
          <Panel className="px-5 py-5" aria-labelledby="ma-on-chain">
            <h2 id="ma-on-chain" className="mb-4 font-semibold">
              Mã trên blockchain
            </h2>
            <ProofList proof={passport.proof} registered checks={false} />
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
