import { CircleAlert } from 'lucide-react';

/** Lỗi chung của form (không gắn với ô nào), được trình đọc màn hình đọc ngay khi xuất hiện. */
export function FormAlert({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-control bg-bad-tint px-3 py-2 text-sm text-bad"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      {message}
    </p>
  );
}
