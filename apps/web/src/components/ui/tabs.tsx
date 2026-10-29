'use client';

import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

export interface TabItem<Id extends string> {
  id: Id;
  label: string;
  /** Số mục trong tab, hiện cạnh nhãn. */
  count?: number;
}

/**
 * Tab theo mẫu WAI-ARIA: phím mũi tên trái/phải, Home, End để chuyển tab;
 * chỉ tab đang chọn nằm trong thứ tự Tab của bàn phím.
 */
export function Tabs<Id extends string>({
  label,
  items,
  initial,
  children,
  className,
}: {
  label: string;
  items: readonly TabItem<Id>[];
  initial?: Id;
  children: (active: Id) => ReactNode;
  className?: string;
}) {
  const baseId = useId();
  const [active, setActive] = useState<Id | undefined>(initial ?? items[0]?.id);
  const tabRefs = useRef(new Map<Id, HTMLButtonElement>());

  if (active === undefined) {
    return null;
  }

  function select(index: number) {
    const item = items[(index + items.length) % items.length];
    if (item) {
      setActive(item.id);
      tabRefs.current.get(item.id)?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = items.findIndex((item) => item.id === active);
    const moves: Record<string, number> = {
      ArrowRight: current + 1,
      ArrowLeft: current - 1,
      Home: 0,
      End: items.length - 1,
    };
    const next = moves[event.key];
    if (next !== undefined) {
      event.preventDefault();
      select(next);
    }
  }

  return (
    <div className={className}>
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex flex-wrap gap-1">
        {items.map((item) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              ref={(node) => {
                if (node) {
                  tabRefs.current.set(item.id, node);
                } else {
                  tabRefs.current.delete(item.id);
                }
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(item.id)}
              className={cn(
                'flex h-7 items-center gap-1 rounded-full border px-2.5 text-[13px] whitespace-nowrap transition-colors',
                selected
                  ? 'border-primary bg-primary font-medium text-primary-ink'
                  : 'border-line-strong text-muted hover:bg-tint hover:text-ink',
              )}
            >
              {item.label}
              {item.count === undefined ? null : (
                <span className={cn('tabular-nums', selected ? 'opacity-80' : 'text-muted')}>
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel-${active}`}
        aria-labelledby={`${baseId}-tab-${active}`}
        tabIndex={0}
        className="rounded-control focus-visible:outline-offset-4"
      >
        {children(active)}
      </div>
    </div>
  );
}
