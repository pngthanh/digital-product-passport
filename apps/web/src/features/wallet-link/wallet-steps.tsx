import { Check, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { LinkStep } from './link-wallet';

const STEP_ORDER: readonly LinkStep[] = ['connect', 'sign', 'send', 'confirm'];

/** Tiến trình 4 bước liên kết ví; bước đang chạy có vòng xoay, bước xong có dấu tích. */
export function WalletSteps({
  current,
  labels,
}: {
  current: LinkStep | 'done';
  labels: Readonly<Record<LinkStep, string>>;
}) {
  const currentIndex = current === 'done' ? STEP_ORDER.length : STEP_ORDER.indexOf(current);

  return (
    <ol className="grid gap-2.5" aria-label="Tiến trình liên kết ví">
      {STEP_ORDER.map((step, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'todo';
        return (
          <li
            key={step}
            className={cn('flex items-start gap-3 text-sm', state === 'todo' && 'text-muted')}
            aria-current={state === 'active' ? 'step' : undefined}
          >
            <span
              className={cn(
                'mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                state === 'done' && 'bg-ok-tint text-ok',
                state === 'active' && 'bg-tint text-tint-ink',
                state === 'todo' && 'ring-1 ring-line-strong ring-inset',
              )}
            >
              {state === 'done' ? (
                <Check aria-hidden className="size-3" />
              ) : state === 'active' ? (
                <LoaderCircle aria-hidden className="size-3 animate-spin" />
              ) : (
                index + 1
              )}
            </span>
            <span>{labels[step]}</span>
          </li>
        );
      })}
    </ol>
  );
}
