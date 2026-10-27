import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Khối nền trắng viền mảnh — dùng khi nội dung thật sự cần gom nhóm. */
export function Panel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn('rounded-panel border border-line bg-surface', className)} {...props} />
  );
}
