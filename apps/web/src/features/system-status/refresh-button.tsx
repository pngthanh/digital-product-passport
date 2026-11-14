'use client';

import { RotateCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

export function RefreshButton({
  label = 'Kiểm tra lại',
  pendingLabel = 'Đang kiểm tra…',
}: {
  label?: string;
  pendingLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <RotateCw aria-hidden className={cn('size-3.5', pending && 'animate-spin')} />
      {pending ? pendingLabel : label}
    </Button>
  );
}
