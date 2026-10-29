'use client';

import { explorerAddressUrl, explorerTxUrl, shortenHex } from '@dpp/shared';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Mã giao dịch hoặc địa chỉ ví rút gọn: bấm để mở trên explorer của mạng (MonadVision với Monad
 * Testnet) và tự kiểm chứng; nút bên cạnh chép giá trị đầy đủ.
 */
export function ChainLink({
  chainId,
  value,
  kind,
  className,
}: {
  chainId: number;
  value: string;
  kind: 'tx' | 'address';
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const url = kind === 'tx' ? explorerTxUrl(chainId, value) : explorerAddressUrl(chainId, value);
  const text = (
    <code className="font-mono text-[13px]" title={value}>
      {shortenHex(value, kind === 'tx' ? 8 : 6, 6)}
    </code>
  );

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-tint-ink underline-offset-4 hover:underline"
        >
          {text}
          <ExternalLink className="size-3.5" aria-hidden />
          <span className="sr-only">
            {kind === 'tx' ? '(xem giao dịch trên explorer)' : '(xem ví trên explorer)'}
          </span>
        </a>
      ) : (
        text
      )}
      <button
        type="button"
        onClick={copy}
        className="rounded p-1 text-muted hover:bg-tint hover:text-ink"
        aria-label={copied ? 'Đã chép' : 'Chép giá trị đầy đủ'}
      >
        {copied ? (
          <Check className="size-3.5" aria-hidden />
        ) : (
          <Copy className="size-3.5" aria-hidden />
        )}
      </button>
    </span>
  );
}
