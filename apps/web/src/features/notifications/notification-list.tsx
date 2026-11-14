'use client';

import type { NotificationView, OrgType } from '@dpp/shared';
import { CheckCheck } from 'lucide-react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { formatDate, formatTime } from '@/lib/format';
import { describeWalletError } from '@/lib/wallet/wallet-errors';
import { FormAlert } from '../auth/form-alert';
import { notificationSummarySchema } from '../lifecycle/lifecycle.schema';
import { notificationText } from './notification-text';

function markRead(ids?: readonly string[]) {
  return apiRequest('/me/notifications/read', notificationSummarySchema, {
    method: 'POST',
    body: ids ? { ids } : {},
  });
}

/** Danh sách thông báo: bấm một thông báo thì đánh dấu đã đọc rồi mở trang liên quan. */
export function NotificationList({
  items,
  unread,
  orgType,
}: {
  items: readonly NotificationView[];
  unread: number;
  orgType: OrgType | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open(item: NotificationView, href: string) {
    setError(null);
    try {
      if (!item.readAt) {
        await markRead([item.id]);
      }
      router.push(href as Route);
      router.refresh();
    } catch (failure) {
      setError(describeWalletError(failure));
    }
  }

  async function readAll() {
    setError(null);
    setBusy(true);
    try {
      await markRead();
      router.refresh();
    } catch (failure) {
      setError(describeWalletError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {unread > 0 ? `${unread} thông báo chưa đọc` : 'Không có thông báo chưa đọc'}
        </p>
        {unread > 0 ? (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void readAll()}>
            <CheckCheck aria-hidden className="size-4" />
            Đánh dấu tất cả đã đọc
          </Button>
        ) : null}
      </div>
      <FormAlert message={error} />
      <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
        {items.map((item) => {
          const text = notificationText(item, orgType);
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => void open(item, text.href)}
                className={cn(
                  'grid w-full gap-1 px-5 py-4 text-left hover:bg-tint',
                  !item.readAt && 'bg-tint/50',
                )}
              >
                <span className="flex flex-wrap items-center gap-2">
                  {!item.readAt ? (
                    <span aria-label="Chưa đọc" className="size-2 rounded-full bg-primary" />
                  ) : null}
                  <span
                    className={cn('font-medium', item.type === 'PRODUCT_RECALLED' && 'text-bad')}
                  >
                    {text.title}
                  </span>
                  <span className="text-[13px] text-muted">
                    {formatDate(item.createdAt)} {formatTime(item.createdAt)}
                  </span>
                </span>
                <span className="text-sm break-words text-muted">{text.body}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
