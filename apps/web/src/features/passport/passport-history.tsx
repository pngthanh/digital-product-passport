'use client';

import type { ChainEventView } from '@dpp/shared';
import { ChainLink } from '@/components/ui/chain-link';
import { Tabs } from '@/components/ui/tabs';
import { formatDate, formatTime } from '@/lib/format';

type Category = 'distribution' | 'service' | 'ownership';
type TabId = 'all' | Category;

/** Nhóm của từng event trên hộ chiếu; module sau thêm event bảo hành, chuyển nhượng vào đây. */
const EVENTS: Readonly<Record<string, { title: string; category: Category }>> = {
  ProductRegistered: { title: 'Nhà sản xuất phát hành hộ chiếu', category: 'distribution' },
};

const TABS: readonly { id: TabId; label: string; empty: string }[] = [
  { id: 'all', label: 'Tất cả', empty: 'Chưa có sự kiện nào được ghi nhận.' },
  { id: 'distribution', label: 'Phân phối', empty: 'Chưa có lần phát hành hay bàn giao nào.' },
  { id: 'service', label: 'Bảo hành', empty: 'Chưa có lần kích hoạt bảo hành hay sửa chữa nào.' },
  { id: 'ownership', label: 'Chuyển nhượng', empty: 'Chưa có lần đổi chủ nào.' },
];

function eventsOf(events: readonly ChainEventView[], tab: TabId) {
  return tab === 'all'
    ? events
    : events.filter((event) => EVENTS[event.eventName]?.category === tab);
}

/** Lịch sử đã ghi trên blockchain, chia tab như hồ sơ mẫu; mỗi mục mở được giao dịch trên explorer. */
export function PassportHistory({
  events,
  chainId,
  issuerName,
}: {
  events: readonly ChainEventView[];
  chainId: number;
  issuerName: string;
}) {
  const ordered = events.toReversed();
  const tabs = TABS.map((tab) => ({
    id: tab.id,
    label: tab.label,
    count: eventsOf(ordered, tab.id).length,
  }));

  return (
    <section className="px-6 py-4">
      <h3 className="text-sm font-medium">Lịch sử đã ghi nhận</h3>
      <Tabs label="Lọc lịch sử theo nhóm sự kiện" items={tabs} className="mt-3">
        {(active) => {
          const visible = eventsOf(ordered, active);
          if (visible.length === 0) {
            return (
              <p className="py-4 text-sm text-muted">
                {TABS.find((tab) => tab.id === active)?.empty}
              </p>
            );
          }
          return (
            <ol className="mt-4 space-y-3 border-l border-line pl-4">
              {visible.map((event) => (
                <li key={`${event.txHash}-${event.logIndex}`} className="relative">
                  <span
                    aria-hidden
                    className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-surface bg-primary"
                  />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-sm font-medium">
                      {EVENTS[event.eventName]?.title ?? event.eventName}
                    </p>
                    <time
                      dateTime={event.blockTimestamp}
                      className="text-xs text-muted tabular-nums"
                    >
                      {formatDate(event.blockTimestamp)} {formatTime(event.blockTimestamp)}
                    </time>
                  </div>
                  <p className="text-sm text-muted">
                    {event.eventName === 'ProductRegistered' ? issuerName : 'Bên ghi nhận'}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                    Giao dịch <ChainLink chainId={chainId} value={event.txHash} kind="tx" />
                    <span className="tabular-nums">· block {event.blockNumber}</span>
                  </p>
                </li>
              ))}
            </ol>
          );
        }}
      </Tabs>
    </section>
  );
}
