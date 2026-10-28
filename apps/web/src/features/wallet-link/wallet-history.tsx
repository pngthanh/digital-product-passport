import { explorerTxUrl, type WalletSummary } from '@dpp/shared';
import { Badge } from '@/components/ui/badge';
import { HashText } from '@/components/ui/hash-text';
import { formatDate } from '@/lib/format';
import { WALLET_STATUS_LABELS } from '@/lib/state-labels';

/** Lịch sử ví cá nhân (mới nhất trước); ví đã thay vẫn giữ lại để đối chiếu giao dịch cũ. */
export function WalletHistory({ wallets, chainId }: { wallets: WalletSummary[]; chainId: number }) {
  if (wallets.length === 0) {
    return <p className="text-sm text-muted">Chưa có ví nào.</p>;
  }
  return (
    <ul className="divide-y divide-line">
      {wallets.map((wallet) => {
        const status = WALLET_STATUS_LABELS[wallet.status];
        const txUrl = wallet.linkTxHash ? explorerTxUrl(chainId, wallet.linkTxHash) : null;
        return (
          <li
            key={wallet.id}
            className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
          >
            <div className="min-w-0">
              <HashText value={wallet.address} />
              <p className="mt-0.5 text-sm text-muted">
                {wallet.activatedAt
                  ? `Dùng từ ${formatDate(wallet.activatedAt)}`
                  : 'Chưa kích hoạt'}
                {wallet.revokedAt ? ` đến ${formatDate(wallet.revokedAt)}` : ''}
                {txUrl ? (
                  <>
                    {' · '}
                    <a href={txUrl} target="_blank" rel="noreferrer" className="hover:text-ink">
                      giao dịch
                    </a>
                  </>
                ) : null}
              </p>
            </div>
            <Badge tone={status.tone} className="justify-self-start sm:justify-self-end">
              {status.label}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}
