import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { Tone } from '@/lib/state-labels';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-canvas text-muted ring-1 ring-inset ring-line',
  ocean: 'bg-tint text-tint-ink',
  ok: 'bg-ok-tint text-ok',
  warn: 'bg-warn-tint text-warn',
  bad: 'bg-bad-tint text-bad',
};

const DOT_CLASSES: Record<Tone, string> = {
  neutral: 'bg-muted',
  ocean: 'bg-focus',
  ok: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad',
};

export function Badge({
  tone = 'neutral',
  dot = false,
  children,
  className,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden className={cn('size-1.5 rounded-full', DOT_CLASSES[tone])} /> : null}
      {children}
    </span>
  );
}
