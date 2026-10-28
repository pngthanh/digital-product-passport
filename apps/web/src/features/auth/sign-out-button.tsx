'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { apiCommand } from '@/lib/api-client';

/** ACC-02: đăng xuất khỏi mọi thiết bị (API tăng session_version). */
export function SignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          // Lỗi mạng vẫn đưa về trang chủ; cookie hết hạn theo thời gian nếu API không nhận được.
          await apiCommand('/auth/logout').catch(() => undefined);
          router.replace('/');
          router.refresh();
        })
      }
    >
      <LogOut aria-hidden className="size-3.5" />
      <span className="hidden sm:inline">{pending ? 'Đang thoát…' : 'Đăng xuất'}</span>
    </Button>
  );
}
