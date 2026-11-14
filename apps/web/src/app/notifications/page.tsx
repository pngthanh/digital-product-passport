import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Panel } from '@/components/ui/panel';
import { getIdentity } from '@/features/auth/get-identity';
import { myNotificationsSchema } from '@/features/lifecycle/lifecycle.schema';
import { NotificationList } from '@/features/notifications/notification-list';
import { workspaceSchema } from '@/features/products/product.schema';
import { serverGet } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Thông báo' };

const PAGE_SIZE = 20;

function readPage(value: string | string[] | undefined): number {
  const page = typeof value === 'string' ? Number.parseInt(value, 10) : 1;
  return Number.isFinite(page) && page > 0 ? page : 1;
}

/** Thông báo trong ứng dụng (M10) của người dùng và tổ chức họ đại diện, mới nhất trước. */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const identity = await getIdentity();
  if (!identity) {
    redirect('/login');
  }
  const page = readPage((await searchParams).page);
  const [view, workspace] = await Promise.all([
    serverGet(`/me/notifications?page=${page}&pageSize=${PAGE_SIZE}`, myNotificationsSchema),
    serverGet('/me/workspace', workspaceSchema),
  ]);
  const pages = view ? Math.max(1, Math.ceil(view.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight">Thông báo</h1>
      <p className="mt-2 text-muted">
        Thu hồi sản phẩm, hàng gửi tới cửa hàng, kết quả sửa chữa, kiểm định và chuyển nhượng liên
        quan tới bạn hoặc doanh nghiệp bạn đại diện.
      </p>
      <div className="mt-8">
        {view === null ? (
          <Panel className="px-5 py-6">
            <p className="font-medium text-bad">Không tải được thông báo từ API.</p>
            <p className="mt-1 text-sm text-muted">Kiểm tra API đang chạy rồi tải lại trang.</p>
          </Panel>
        ) : view.items.length === 0 ? (
          <Panel className="px-5 py-8 text-center">
            <p className="font-medium">Chưa có thông báo nào.</p>
          </Panel>
        ) : (
          <NotificationList
            items={view.items}
            unread={view.unread}
            orgType={workspace?.organization?.orgType ?? null}
          />
        )}
        {pages > 1 ? (
          <nav aria-label="Phân trang" className="mt-4 flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link
                href={{ pathname: '/notifications', query: { page: String(page - 1) } }}
                className="font-medium text-tint-ink hover:underline"
              >
                ← Trang trước
              </Link>
            ) : (
              <span />
            )}
            <span className="text-muted tabular-nums">
              Trang {page}/{pages}
            </span>
            {page < pages ? (
              <Link
                href={{ pathname: '/notifications', query: { page: String(page + 1) } }}
                className="font-medium text-tint-ink hover:underline"
              >
                Trang sau →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
