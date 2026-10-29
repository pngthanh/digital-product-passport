'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

export interface NavItem {
  href: Route;
  label: string;
}

/** Điều hướng chức năng theo vai trò của người đang đăng nhập. */
export function MainNav({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Điều hướng chính" className="flex min-w-0 items-center gap-1 overflow-x-auto">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-control px-2 py-1.5 text-sm whitespace-nowrap transition-colors sm:px-3',
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
