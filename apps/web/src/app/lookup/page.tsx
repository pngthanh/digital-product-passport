import { extractPublicCode } from '@dpp/shared';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Panel } from '@/components/ui/panel';
import { CODE_FORMAT_HINT } from '@/features/lookup/code-format-hint';
import { LookupForm } from '@/features/lookup/lookup-form';

export const metadata: Metadata = { title: 'Tra cứu sản phẩm' };

/** Tra cứu hộ chiếu sản phẩm bằng mã trên tem: công khai, không cần đăng nhập. */
export default async function LookupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Form gửi `?code=` khi JavaScript chưa chạy (mạng chậm, mở qua địa chỉ IP lúc phát triển).
  const { code: raw } = await searchParams;
  const submitted = typeof raw === 'string' ? raw.trim() : '';
  const code = submitted ? extractPublicCode(submitted) : null;
  if (code) {
    redirect(`/p/${code}`);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight">Tra cứu sản phẩm</h1>
      <p className="mt-2 text-muted">
        Quét mã QR trên tem hoặc gõ mã 12 ký tự để xem hộ chiếu số: nhà sản xuất, trạng thái và lịch
        sử đã ghi trên blockchain, kèm mã giao dịch để tự kiểm chứng.
      </p>
      <Panel className="mt-8 px-5 py-5">
        <LookupForm
          initialCode={submitted || undefined}
          initialError={submitted ? CODE_FORMAT_HINT : undefined}
        />
      </Panel>
    </div>
  );
}
