import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { HashText } from '@/components/ui/hash-text';
import { Panel } from '@/components/ui/panel';
import { getIdentity } from '@/features/auth/get-identity';
import { WalletHistory } from '@/features/wallet-link/wallet-history';
import { WalletPanel } from '@/features/wallet-link/wallet-panel';
import { publicEnv } from '@/lib/env';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Tài khoản' };

const ROLE_LABELS = { ADMIN: 'Quản trị viên', USER: 'Người dùng' } as const;

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 font-medium break-words">{children}</dd>
    </div>
  );
}

export default async function AccountPage() {
  const identity = await getIdentity();
  if (!identity) {
    redirect('/login');
  }
  const { account, party, wallets } = identity;
  const chainId = publicEnv.NEXT_PUBLIC_CHAIN_ID;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-sm text-muted">Tài khoản</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">{account.fullName}</h1>
      <p className="mt-1 text-muted">{account.email}</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid content-start gap-6">
          <Panel className="px-5 py-5">
            <WalletPanel wallets={wallets} chainId={chainId} />
          </Panel>
          <Panel className="px-5 py-5" aria-labelledby="lich-su-vi">
            <h2 id="lich-su-vi" className="mb-4 font-semibold">
              Lịch sử ví
            </h2>
            <WalletHistory wallets={wallets} chainId={chainId} />
          </Panel>
        </div>

        <div className="grid content-start gap-6">
          <Panel className="px-5 py-5" aria-labelledby="ho-so">
            <h2 id="ho-so" className="font-semibold">
              Hồ sơ
            </h2>
            <dl className="mt-4 grid gap-3">
              <Detail label="Họ và tên">{account.fullName}</Detail>
              <Detail label="Email">{account.email}</Detail>
              <Detail label="Vai trò">{ROLE_LABELS[account.systemRole]}</Detail>
              <Detail label="Ngày tạo">{formatDate(account.createdAt)}</Detail>
            </dl>
          </Panel>
          <Panel className="px-5 py-5" aria-labelledby="dinh-danh">
            <h2 id="dinh-danh" className="font-semibold">
              Định danh on-chain
            </h2>
            <p className="mt-1 text-sm text-muted">
              Mọi sự kiện của bạn trên blockchain gắn với partyId, không gắn với ví, nên đổi ví
              không làm mất lịch sử.
            </p>
            <dl className="mt-4 grid gap-3">
              <Detail label="partyId">
                <HashText value={party.partyId} />
              </Detail>
              <Detail label="PartyRegistry">
                {party.registeredOnChain ? (
                  <Badge tone="ok" dot>
                    Đã đăng ký
                  </Badge>
                ) : (
                  <Badge>Chưa đăng ký, cần liên kết ví</Badge>
                )}
              </Detail>
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}
