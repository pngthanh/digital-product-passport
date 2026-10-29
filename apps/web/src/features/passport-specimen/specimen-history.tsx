'use client';

import { shortenHex } from '@dpp/shared';
import { Tabs } from '@/components/ui/tabs';
import { formatDate } from '@/lib/format';
import { eventsOfTab, HISTORY_TABS } from './history-tabs';
import type { SpecimenEvent } from './specimen-data';

/** Lịch sử đã ghi nhận, chia tab theo nhóm sự kiện: phân phối, bảo hành (gồm sửa chữa), chuyển nhượng. */
export function SpecimenHistory({ events }: { events: readonly SpecimenEvent[] }) {
  const tabs = HISTORY_TABS.map((tab) => ({
    id: tab.id,
    label: tab.label,
    count: eventsOfTab(events, tab.id).length,
  }));

  return (
    <section className="px-6 py-4">
      <h3 className="text-sm font-medium">Lịch sử đã ghi nhận</h3>
      <Tabs label="Lọc lịch sử theo nhóm sự kiện" items={tabs} className="mt-3">
        {(active) => {
          const visible = eventsOfTab(events, active);
          if (visible.length === 0) {
            return (
              <p className="py-4 text-sm text-muted">
                {HISTORY_TABS.find((tab) => tab.id === active)?.empty}
              </p>
            );
          }
          return (
            <ol className="mt-4 space-y-3 border-l border-line pl-4">
              {visible.map((event) => (
                <li key={event.id} className="relative">
                  <span
                    aria-hidden
                    className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-surface bg-primary"
                  />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-sm font-medium">{event.title}</p>
                    <time dateTime={event.date} className="text-xs text-muted tabular-nums">
                      {formatDate(event.date)}
                    </time>
                  </div>
                  <p className="text-sm text-muted">{event.actor}</p>
                  <p className="font-mono text-xs text-muted" title={event.txHash}>
                    tx {shortenHex(event.txHash, 6, 4)}
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
