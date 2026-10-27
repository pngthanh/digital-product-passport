'use client';

import { shortenHex } from '@dpp/shared';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';

/** Hiển thị hash/địa chỉ rút gọn bằng font mono, kèm nút chép giá trị đầy đủ. */
export function HashText({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <code className="font-mono text-[13px]" title={value}>
        {shortenHex(value, 8, 6)}
      </code>
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
