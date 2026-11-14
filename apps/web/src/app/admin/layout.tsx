import type { ReactNode } from 'react';
import { requireAdmin } from '@/features/admin/admin-context';
import { AdminNav } from '@/features/admin/admin-nav';
import { alertSummarySchema } from '@/features/monitoring/monitoring.schema';
import { serverGet } from '@/lib/server-api';

/** Khung chung khu Quản trị (M12): chỉ Admin, thanh điều hướng con kèm số cảnh báo đang mở. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  const summary = await serverGet('/admin/alerts/summary', alertSummarySchema);

  return (
    <>
      <div className="border-b border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <AdminNav openAlerts={summary?.open ?? null} />
        </div>
      </div>
      {children}
    </>
  );
}
