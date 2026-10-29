import { Check, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Tiến trình nhiều bước (ví dụ ký, gửi giao dịch, chờ xác nhận); bước đang chạy có vòng xoay. */
export function StepList<Step extends string>({
  label,
  steps,
  current,
  labels,
}: {
  label: string;
  steps: readonly Step[];
  current: Step | 'done';
  labels: Readonly<Record<Step, string>>;
}) {
  const currentIndex = current === 'done' ? steps.length : steps.indexOf(current);

  return (
    <ol className="grid gap-2.5" aria-label={label}>
      {steps.map((step, index) => {
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
