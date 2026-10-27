import { ButtonLink } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Không tìm thấy trang</h1>
      <p className="mt-3 text-muted">
        Đường dẫn này không tồn tại hoặc đã được đổi. Hãy quay lại trang tổng quan.
      </p>
      <ButtonLink href="/" className="mt-8">
        Về trang tổng quan
      </ButtonLink>
    </div>
  );
}
