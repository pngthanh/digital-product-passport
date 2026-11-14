'use client';

import type { PublicPassportView, VerificationContracts } from '@dpp/shared';
import { CircleAlert, CircleCheck, CircleHelp, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChainLink } from '@/components/ui/chain-link';
import { cn } from '@/lib/cn';
import { connectSelfCheckReader } from './browser-chain';
import { runSelfCheck, type SelfCheckItem, type SelfCheckKey } from './self-check';

const LABELS: Record<SelfCheckKey, string> = {
  NETWORK: 'Đúng mạng blockchain',
  PROFILE: 'Hồ sơ đúng như nhà sản xuất đã đăng ký',
  ISSUER: 'Tình trạng doanh nghiệp phát hành',
  STATE: 'Trạng thái sản phẩm',
  CUSTODY: 'Bên đang giữ hàng',
  OWNER: 'Chủ sở hữu',
  WARRANTY: 'Bảo hành',
  TRANSACTIONS: 'Giao dịch trên dòng thời gian',
};

/** Mục luôn kèm giải thích; mục khác chỉ giải thích khi lệch, cho gọn trên điện thoại. */
const ALWAYS_EXPLAIN: ReadonlySet<SelfCheckKey> = new Set(['NETWORK', 'PROFILE', 'TRANSACTIONS']);

type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; step: string }
  | { kind: 'done'; items: SelfCheckItem[]; source: string }
  | { kind: 'failed'; message: string };

function ResultIcon({ ok }: { ok: boolean | null }) {
  const Icon = ok === null ? CircleHelp : ok ? CircleCheck : CircleAlert;
  return (
    <Icon
      aria-hidden
      className={cn(
        'mt-0.5 size-4 shrink-0',
        ok === null ? 'text-muted' : ok ? 'text-ok' : 'text-bad',
      )}
    />
  );
}

/**
 * VER-01, VER-02 (M11): người xem bấm để trình duyệt của chính họ đọc thẳng blockchain qua RPC công
 * khai (hoặc MetaMask), băm lại hồ sơ đang hiển thị và kiểm từng giao dịch, không đi qua máy chủ.
 */
export function SelfCheckPanel({
  passport,
  contracts,
  chainId,
}: {
  passport: PublicPassportView;
  contracts: VerificationContracts;
  chainId: number;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  async function start() {
    setPhase({ kind: 'running', step: 'Đang kết nối RPC công khai…' });
    try {
      const reader = await connectSelfCheckReader(chainId);
      if (!reader) {
        setPhase({
          kind: 'failed',
          message:
            'Trình duyệt này không đọc được blockchain (RPC công khai không trả lời và chưa có MetaMask). Thử lại sau hoặc mở bằng trình duyệt khác.',
        });
        return;
      }
      setPhase({ kind: 'running', step: `Đang đọc contract qua ${reader.source}…` });
      const items = await runSelfCheck(
        reader,
        { expectedChainId: chainId, passport, contracts },
        (done, total) =>
          setPhase({ kind: 'running', step: `Đang kiểm giao dịch ${done}/${total}…` }),
      );
      setPhase({ kind: 'done', items, source: reader.source });
    } catch {
      setPhase({
        kind: 'failed',
        message: 'Đọc blockchain bị gián đoạn (RPC bận hoặc mất mạng). Bấm kiểm tra lại.',
      });
    }
  }

  const failed = phase.kind === 'done' && phase.items.some((item) => item.ok === false);

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted">
        Không cần tin máy chủ của hệ thống: trình duyệt của bạn tự đọc contract trên blockchain, băm
        lại hồ sơ đang hiển thị và kiểm từng giao dịch trên dòng thời gian.
      </p>
      <Button
        variant="secondary"
        size="sm"
        className="justify-self-start"
        disabled={phase.kind === 'running'}
        onClick={() => void start()}
      >
        <ShieldCheck aria-hidden className="size-4" />
        {phase.kind === 'idle' ? 'Tự kiểm tra bằng trình duyệt' : 'Kiểm tra lại'}
      </Button>
      <div aria-live="polite" className="grid gap-3">
        {phase.kind === 'running' ? <p className="text-sm text-muted">{phase.step}</p> : null}
        {phase.kind === 'failed' ? <p className="text-sm text-bad">{phase.message}</p> : null}
        {phase.kind === 'done' ? (
          <>
            <p className={cn('text-sm font-medium', failed ? 'text-bad' : 'text-ok')}>
              {failed
                ? 'Có mục khác dữ liệu trên blockchain. Nếu vừa có giao dịch mới, tải lại trang rồi kiểm tra lại.'
                : 'Trình duyệt đã tự kiểm: trang này khớp dữ liệu trên blockchain.'}
            </p>
            <ul className="grid gap-2 text-sm">
              {phase.items.map((item) => (
                <li key={item.key} className="flex items-start gap-2">
                  <ResultIcon ok={item.ok} />
                  <span className="min-w-0">
                    <span className={cn(item.ok === false && 'font-medium text-bad')}>
                      {LABELS[item.key]}
                    </span>
                    {item.ok !== true || ALWAYS_EXPLAIN.has(item.key) ? (
                      <span className="block text-muted">{item.detail}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[13px] text-muted">Nguồn đọc: {phase.source}.</p>
          </>
        ) : null}
      </div>
      <dl className="grid gap-1.5 text-[13px]">
        <dt className="text-muted">Contract đã đọc (mã nguồn xem được trên explorer)</dt>
        <dd className="grid gap-1">
          <span className="flex flex-wrap items-center gap-x-1.5">
            ProductPassport
            <ChainLink chainId={chainId} value={contracts.productPassport} kind="address" />
          </span>
          <span className="flex flex-wrap items-center gap-x-1.5">
            PartyRegistry
            <ChainLink chainId={chainId} value={contracts.partyRegistry} kind="address" />
          </span>
          {contracts.warrantyManager ? (
            <span className="flex flex-wrap items-center gap-x-1.5">
              WarrantyManager
              <ChainLink chainId={chainId} value={contracts.warrantyManager} kind="address" />
            </span>
          ) : null}
        </dd>
      </dl>
    </div>
  );
}
