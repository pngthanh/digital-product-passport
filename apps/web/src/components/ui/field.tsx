import { type InputHTMLAttributes, type ReactNode, useId } from 'react';
import { cn } from '@/lib/cn';

interface ControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

/** Nhãn + ô nhập + gợi ý/lỗi, tự nối id để trình đọc màn hình đọc đúng. */
export function Field({
  label,
  help,
  error,
  children,
}: {
  label: string;
  help?: string;
  error?: string;
  children: (control: ControlProps) => ReactNode;
}) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? help;

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({
        id,
        'aria-describedby': message ? messageId : undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {message ? (
        <p id={messageId} className={cn('text-sm', error ? 'text-bad' : 'text-muted')}>
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-control border border-line-strong bg-surface px-3 text-[15px] text-ink',
        'placeholder:text-muted aria-invalid:border-bad',
        className,
      )}
      {...props}
    />
  );
}
