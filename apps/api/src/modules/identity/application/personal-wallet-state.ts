import type { TransactionTracking } from '../../chain-sync/index.js';
import type { PersonalWalletState } from '../domain/wallet-binding-plan.js';
import type { WalletRecord } from './ports/party-wallet.repository.js';

/** Gom ví cá nhân ACTIVE và PENDING; PENDING "đang bay" khi giao dịch liên kết còn chờ chốt. */
export async function loadPersonalWalletState(
  wallets: readonly WalletRecord[],
  tracker: Pick<TransactionTracking, 'statusOf'>,
): Promise<PersonalWalletState> {
  const personal = wallets.filter((wallet) => wallet.walletRole === 'PERSONAL');
  const active = personal.find((wallet) => wallet.status === 'ACTIVE') ?? null;
  const pending = personal.find((wallet) => wallet.status === 'PENDING') ?? null;
  const pendingTxStatus = pending?.linkTxHash ? await tracker.statusOf(pending.linkTxHash) : null;
  return {
    active: active && { id: active.id, address: active.address },
    pending: pending && {
      id: pending.id,
      address: pending.address,
      inFlight: pendingTxStatus === 'SUBMITTED',
    },
  };
}
