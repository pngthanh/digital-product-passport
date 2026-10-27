'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const NAV_ITEMS: ReadonlyArray<{ href: Route; label: string }> = [
  { href: '/', label: 'Tổng quan' },
  { href: '/system/status', label: 'Trạng thái hệ thống' },
  { href: '/ui-kit', label: 'Bộ giao diện' },
];

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Điều hướng chính" className="flex items-center gap-1 overflow-x-auto">
      {NAV_ITEMS.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-control px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
              active ? 'bg-tint font-medium text-tint-ink' : 'text-muted hover:text-ink',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
