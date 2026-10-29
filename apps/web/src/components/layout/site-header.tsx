import { getNetwork } from '@dpp/shared';
import { CircleUserRound } from 'lucide-react';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { getIdentity } from '@/features/auth/get-identity';
import { SignOutButton } from '@/features/auth/sign-out-button';
import { serverChainId } from '@/lib/env';
import { BrandMark } from './brand-mark';

export async function SiteHeader() {
  const chainId = serverChainId();
  const network = getNetwork(chainId);
  const identity = await getIdentity();

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:gap-6 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 font-semibold tracking-tight">
          <BrandMark className="size-6" />
          <span className="hidden sm:inline">Hộ chiếu số</span>
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-2 text-sm text-muted lg:inline-flex">
            <span aria-hidden className="size-1.5 rounded-full bg-focus" />
            {network?.name ?? `Chain ${chainId}`}
          </span>
          {identity ? (
            <>
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
