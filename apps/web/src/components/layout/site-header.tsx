import { getNetwork } from '@dpp/shared';
import Link from 'next/link';
import { publicEnv } from '@/lib/env';
import { BrandMark } from './brand-mark';
import { MainNav } from './main-nav';

export function SiteHeader() {
  const network = getNetwork(publicEnv.NEXT_PUBLIC_CHAIN_ID);

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 font-semibold tracking-tight">
          <BrandMark className="size-6" />
          <span className="hidden sm:inline">Hộ chiếu số</span>
        </Link>
        <MainNav />
        <span className="ml-auto hidden shrink-0 items-center gap-2 text-sm text-muted md:inline-flex">
          <span aria-hidden className="size-1.5 rounded-full bg-focus" />
          {network?.name ?? `Chain ${publicEnv.NEXT_PUBLIC_CHAIN_ID}`}
        </span>
      </div>
    </header>
  );
}
