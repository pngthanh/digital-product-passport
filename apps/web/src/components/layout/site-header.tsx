import { getNetwork } from '@dpp/shared';
import { Bell, CircleUserRound } from 'lucide-react';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { getIdentity } from '@/features/auth/get-identity';
import { SignOutButton } from '@/features/auth/sign-out-button';
import { notificationSummarySchema } from '@/features/lifecycle/lifecycle.schema';
import { workspaceSchema } from '@/features/products/product.schema';
import { serverChainId } from '@/lib/env';
import { serverGet } from '@/lib/server-api';
import { BrandMark } from './brand-mark';
import { MainNav, type NavItem } from './main-nav';

export async function SiteHeader() {
  const chainId = serverChainId();
  const network = getNetwork(chainId);
  const identity = await getIdentity();
  // Menu theo vai trò: nhà sản xuất có Sản phẩm, nhà bán lẻ có Kho hàng, trung tâm bảo hành có Bảo
  // hành, đơn vị kiểm định có Kiểm định; người không đại diện tổ chức nào (hoặc đã mua hàng) có Đã mua.
  // Ai cũng có Chuyển nhượng vì ai cũng có thể là bên nhận.
  const [workspace, notifications] = identity
    ? await Promise.all([
        serverGet('/me/workspace', workspaceSchema),
        serverGet('/me/notifications/summary', notificationSummarySchema),
      ])
    : [null, null];
  const unread = notifications?.unread ?? 0;
  const orgType = workspace?.organization?.orgType;
  const showOwned = !!workspace && (workspace.ownedProducts > 0 || !workspace.organization);
  const navItems: NavItem[] = [
    { href: '/lookup', label: 'Tra cứu' },
    ...(identity
      ? [
          ...(orgType === 'MANUFACTURER'
            ? [{ href: '/products' as const, label: 'Sản phẩm' }]
            : []),
          ...(orgType === 'RETAILER' ? [{ href: '/inventory' as const, label: 'Kho hàng' }] : []),
          ...(orgType === 'SERVICE_CENTER'
            ? [{ href: '/service' as const, label: 'Bảo hành' }]
            : []),
          ...(orgType === 'INSPECTOR'
            ? [{ href: '/inspection' as const, label: 'Kiểm định' }]
            : []),
          ...(showOwned ? [{ href: '/owned' as const, label: 'Đã mua' }] : []),
          { href: '/transfers' as const, label: 'Chuyển nhượng' },
          { href: '/organization' as const, label: 'Doanh nghiệp' },
          ...(identity.account.systemRole === 'ADMIN'
            ? [{ href: '/admin' as const, label: 'Quản trị' }]
            : []),
        ]
      : []),
  ];

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur print:hidden">
      {/* Màn hình nhỏ: menu xuống hàng thứ hai, đủ chỗ cho mọi mục mà không bị cắt. */}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 px-4 sm:h-14 sm:flex-nowrap sm:gap-6 sm:px-6">
        <Link
          href="/"
          className="flex h-14 shrink-0 items-center gap-2.5 font-semibold tracking-tight sm:h-auto"
        >
          <BrandMark className="size-6" />
          <span>Hộ chiếu số</span>
        </Link>
        <div className="order-last -mx-4 w-[calc(100%+2rem)] border-t border-line px-2 py-1.5 sm:order-none sm:mx-0 sm:w-auto sm:min-w-0 sm:border-0 sm:p-0">
          <MainNav items={navItems} />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-2 text-sm text-muted lg:inline-flex">
            <span aria-hidden className="size-1.5 rounded-full bg-focus" />
            {network?.name ?? `Chain ${chainId}`}
          </span>
          {identity ? (
            <>
              <Link
                href="/notifications"
                aria-label={unread > 0 ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}
                className="relative flex items-center rounded-control p-2 text-muted hover:bg-tint hover:text-ink"
              >
                <Bell aria-hidden className="size-4" />
                {unread > 0 ? (
                  <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-bad px-1 text-center text-[11px] leading-4 font-semibold text-white tabular-nums">
                    {unread > 9 ? '9+' : unread}
                  </span>
                ) : null}
              </Link>
              <Link
                href="/account"
                aria-label={`Tài khoản của ${identity.account.fullName}`}
                className="flex items-center gap-2 rounded-control px-2 py-1.5 text-sm font-medium hover:bg-tint"
              >
                <CircleUserRound aria-hidden className="size-4 text-muted sm:hidden" />
                <span className="hidden max-w-36 truncate sm:inline">
                  {identity.account.fullName}
                </span>
              </Link>
              <SignOutButton />
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm">
                Đăng nhập
              </ButtonLink>
              <ButtonLink href="/register" size="sm" className="hidden sm:inline-flex">
                Đăng ký
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
