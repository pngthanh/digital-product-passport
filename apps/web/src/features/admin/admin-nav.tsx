'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

interface AdminNavItem {
  href: Route;
  label: string;
  /** Chỉ sáng khi đúng đường dẫn (Tổng quan), không sáng theo trang con. */
  exact?: boolean;
  count?: number;
}

/** Điều hướng con của khu Quản trị (M12); số cạnh Cảnh báo là số cảnh báo đang mở. */
export function AdminNav({ openAlerts }: { openAlerts: number | null }) {
  const pathname = usePathname();
  const items: AdminNavItem[] = [
    { href: '/admin', label: 'Tổng quan', exact: true },
    { href: '/admin/organizations', label: 'Doanh nghiệp' },
    { href: '/admin/alerts', label: 'Cảnh báo', count: openAlerts ?? undefined },
    { href: '/admin/audit', label: 'Nhật ký' },
  ];

  return (
    <nav aria-label="Khu Quản trị" className="-mx-1 flex gap-1 overflow-x-auto px-1">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-9 items-center gap-2 border-b-2 px-3 text-sm whitespace-nowrap transition-colors',
              active
                ? 'border-primary font-medium text-ink'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {item.label}
            {item.count ? (
              <span className="rounded-full bg-warn-tint px-1.5 text-xs font-medium text-warn tabular-nums">
                <span className="sr-only">, đang mở </span>
                {item.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
