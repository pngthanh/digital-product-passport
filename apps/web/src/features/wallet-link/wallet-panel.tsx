'use client';

import {
  explorerAddressUrl,
  getNetwork,
  type WalletLinkPurpose,
  type WalletSummary,
} from '@dpp/shared';
import { ExternalLink, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useSyncExternalStore } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { StepList } from '@/components/ui/step-list';
import { formatDate, formatTime } from '@/lib/format';
import { WALLET_STATUS_LABELS } from '@/lib/state-labels';
import { FormAlert } from '../auth/form-alert';
import { injectedProvider } from '@/lib/wallet/ethereum';
import { LINK_STEPS, type LinkStep, linkWallet } from './link-wallet';
import { describeWalletError } from '@/lib/wallet/wallet-errors';

const METAMASK_DOWNLOAD_URL = 'https://metamask.io/download/';

const subscribeNothing = () => () => undefined;

/** Có MetaMask hay không chỉ biết được trên trình duyệt; phía server trả `null`. */
function useHasInjectedWallet(): boolean | null {
  return useSyncExternalStore(
    subscribeNothing,
    () => injectedProvider() !== null,
    () => null,
  );
}

type Activity =
  | { kind: 'idle' }
  | { kind: 'confirm-rotation' }
  | { kind: 'running'; purpose: WalletLinkPurpose; step: LinkStep }
  | { kind: 'done'; purpose: WalletLinkPurpose };

/** ACC-03 (liên kết MetaMask) và ACC-04 (đổi ví cá nhân) trên trang Tài khoản. */
export function WalletPanel({ wallets, chainId }: { wallets: WalletSummary[]; chainId: number }) {
  const router = useRouter();
  const hasWallet = useHasInjectedWallet();
  const [activity, setActivity] = useState<Activity>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const network = getNetwork(chainId);
  const active = wallets.find((wallet) => wallet.status === 'ACTIVE');
  const pending = wallets.find((wallet) => wallet.status === 'PENDING');
  const running = activity.kind === 'running';
  const rotating = 'purpose' in activity && activity.purpose === 'ROTATE';

  const stepLabels: Record<LinkStep, string> = {
    connect: `Kết nối MetaMask, chuyển sang mạng ${network?.name ?? `chain ${chainId}`}`,
    sign: 'Ký thông điệp chứng minh bạn sở hữu ví (không tốn phí)',
    send: `Gửi giao dịch ${rotating ? 'rotateWallet' : 'registerUser'} lên PartyRegistry, tự trả gas bằng MON`,
    confirm: 'Chờ block finalized và hệ thống ghi nhận ví',
  };

  async function start(purpose: WalletLinkPurpose, password?: string) {
    setError(null);
    setActivity({ kind: 'running', purpose, step: 'connect' });
    try {
      await linkWallet({
        chainId,
        purpose,
        password,
        onStep: (step) => setActivity({ kind: 'running', purpose, step }),
      });
      setActivity({ kind: 'done', purpose });
      router.refresh();
    } catch (failure) {
      setError(describeWalletError(failure));
      setActivity(purpose === 'ROTATE' ? { kind: 'confirm-rotation' } : { kind: 'idle' });
    }
  }

  function onRotate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get('password');
    if (typeof password !== 'string' || password.length === 0) {
      setError('Nhập mật khẩu để xác nhận đổi ví.');
      return;
    }
    void start('ROTATE', password);
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Ví cá nhân</h2>
          <p className="mt-1 text-sm text-muted">
            Ví MetaMask của bạn ký các giao dịch nghiệp vụ và tự trả gas bằng MON testnet.
          </p>
        </div>
        {active ? (
          <Badge tone="ok" dot>
            Đã liên kết
          </Badge>
        ) : (
          <Badge>Chưa liên kết</Badge>
        )}
      </div>

      {active ? <CurrentWallet wallet={active} chainId={chainId} /> : null}
      {pending && !running ? (
        <p className="rounded-control bg-warn-tint px-3 py-2 text-sm text-warn">
          Ví {pending.address.slice(0, 10)}… đang chờ xác nhận trên blockchain
          {pending.linkTxHash ? '' : '. Nếu bạn chưa gửi giao dịch, hãy làm lại từ đầu'}.
        </p>
      ) : null}

      {running || activity.kind === 'done' ? (
        <StepList
          label="Tiến trình liên kết ví"
          steps={LINK_STEPS}
          current={activity.kind === 'running' ? activity.step : 'done'}
          labels={stepLabels}
        />
      ) : null}
      {activity.kind === 'done' ? (
        <p role="status" className="text-sm text-ok">
          {activity.purpose === 'ROTATE' ? 'Đã đổi sang ví mới.' : 'Đã liên kết ví thành công.'}
        </p>
      ) : null}

      <FormAlert message={error} />

      {hasWallet === false ? (
        <p className="text-sm text-muted">
          Trình duyệt chưa có MetaMask.{' '}
          <a
            href={METAMASK_DOWNLOAD_URL}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-tint-ink underline-offset-4 hover:underline"
          >
            Cài MetaMask
          </a>{' '}
          rồi tải lại trang.
        </p>
      ) : null}

      {activity.kind === 'confirm-rotation' ? (
        <form noValidate onSubmit={onRotate} className="grid gap-4 border-t border-line pt-5">
          <p className="text-sm">
            Mở MetaMask và <strong className="font-medium">chọn tài khoản ví mới</strong> trước. Ví
            hiện tại sẽ ngừng đại diện cho tài khoản này và không dùng lại được.
          </p>
          <Field label="Mật khẩu tài khoản" help="Nhập lại mật khẩu để xác nhận đổi ví.">
            {(control) => (
              <Input {...control} name="password" type="password" autoComplete="current-password" />
            )}
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button type="submit">Tiếp tục với ví mới</Button>
            <Button
              variant="ghost"
              onClick={() => {
                setError(null);
                setActivity({ kind: 'idle' });
              }}
            >
              Huỷ
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {active ? (
            <Button
              variant="secondary"
              disabled={running || hasWallet !== true}
              onClick={() => {
                setError(null);
                setActivity({ kind: 'confirm-rotation' });
              }}
            >
              Đổi ví
            </Button>
          ) : (
            <Button disabled={running || hasWallet !== true} onClick={() => void start('LINK')}>
              <Wallet aria-hidden className="size-4" />
              {running ? 'Đang liên kết…' : 'Liên kết MetaMask'}
            </Button>
          )}
          {network?.faucetUrl ? (
            <a
              href={network.faucetUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Nhận MON testnet
            </a>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CurrentWallet({ wallet, chainId }: { wallet: WalletSummary; chainId: number }) {
  const explorerUrl = explorerAddressUrl(chainId, wallet.address);
  return (
    <div className="rounded-control border border-line bg-canvas px-4 py-3">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">Đang dùng</p>
      <p className="mt-1 font-mono text-[13px] break-all">{wallet.address}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        {wallet.activatedAt ? (
          <span>
            Kích hoạt {formatTime(wallet.activatedAt)} {formatDate(wallet.activatedAt)}
          </span>
        ) : null}
        <Badge tone={WALLET_STATUS_LABELS[wallet.status].tone}>
          {WALLET_STATUS_LABELS[wallet.status].label}
        </Badge>
        {explorerUrl ? (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-ink"
          >
            Xem trên explorer <ExternalLink aria-hidden className="size-3.5" />
          </a>
        ) : null}
      </div>
    </div>
  );
}
