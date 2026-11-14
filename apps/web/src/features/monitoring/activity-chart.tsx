'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { axisNumber, niceScale, shortDay } from './chart-scale';

interface DayCount {
  day: string;
  events: number;
}

const PLOT_HEIGHT = 160;

/**
 * Cột event on-chain mỗi ngày (AUD-02). Một chuỗi số liệu nên không có chú giải; tiêu đề nói cột
 * là gì. Di chuột hoặc Tab vào cột để xem số; bảng bên dưới có đủ số liệu mà không cần di chuột.
 */
export function ActivityChart({ days }: { days: readonly DayCount[] }) {
  const [active, setActive] = useState<number | null>(null);
  const peak = Math.max(0, ...days.map((item) => item.events));
  const scale = niceScale(peak);
  const peakIndex = peak > 0 ? days.findIndex((item) => item.events === peak) : -1;
  const empty = peak === 0;
  const hovered = active === null ? null : days[active];

  return (
    <div>
      <div className="relative flex gap-2" style={{ height: PLOT_HEIGHT + 24 }}>
        {/* Trục dọc: số tròn, chữ nhỏ màu phụ. */}
        <div
          aria-hidden
          className="relative w-8 shrink-0 text-right text-[11px] text-muted tabular-nums"
          style={{ height: PLOT_HEIGHT }}
        >
          {scale.ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: PLOT_HEIGHT - (tick / scale.max) * PLOT_HEIGHT }}
            >
              {axisNumber(tick)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {/* Lưới mảnh, liền nét; đường đáy đậm hơn một bậc. */}
          <div aria-hidden className="absolute inset-x-0 top-0" style={{ height: PLOT_HEIGHT }}>
            {scale.ticks.map((tick) => (
              <div
                key={tick}
                className={cn(
                  'absolute inset-x-0 h-px',
                  tick === 0 ? 'bg-line-strong' : 'bg-chart-grid',
                )}
                style={{ top: PLOT_HEIGHT - (tick / scale.max) * PLOT_HEIGHT }}
              />
            ))}
          </div>

          {empty ? (
            <p
              className="absolute inset-x-0 text-center text-sm text-muted"
              style={{ top: PLOT_HEIGHT / 2 - 10 }}
            >
              Chưa có event nào trong 14 ngày.
            </p>
          ) : null}

          <ol
            aria-label="Event on-chain mỗi ngày"
            className="relative flex h-full items-stretch"
            onPointerLeave={() => setActive(null)}
          >
            {days.map((item, index) => {
              const height = (item.events / scale.max) * PLOT_HEIGHT;
              return (
                <li
                  key={item.day}
                  tabIndex={0}
                  aria-label={`${shortDay(item.day)}: ${formatNumber(item.events)} event`}
                  onPointerEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                  className="group relative flex min-w-0 flex-1 cursor-default flex-col items-center rounded-control outline-offset-0"
                >
                  <div
                    className="relative flex w-full justify-center"
                    style={{ height: PLOT_HEIGHT }}
                  >
                    {index === peakIndex ? (
                      <span
                        aria-hidden
                        className="absolute text-[11px] font-medium text-ink tabular-nums"
                        style={{ bottom: height + 4 }}
                      >
                        {formatNumber(item.events)}
                      </span>
                    ) : null}
                    <div
                      aria-hidden
                      className={cn(
                        'absolute bottom-0 w-[min(24px,70%)] rounded-t-[4px] bg-chart-1 transition-opacity',
                        active !== null && active !== index && 'opacity-60',
                      )}
                      style={{ height: item.events > 0 ? Math.max(height, 2) : 0 }}
                    />
                  </div>
                  <span
                    aria-hidden
                    className={cn(
                      'mt-1.5 text-[11px] text-muted tabular-nums',
                      // Màn hẹp chỉ ghi nhãn ngày cách một.
                      (days.length - 1 - index) % 2 === 1 && 'max-sm:invisible',
                    )}
                  >
                    {shortDay(item.day)}
                  </span>
                </li>
              );
            })}
          </ol>

          {hovered && active !== null ? (
            <div
              role="status"
              className="pointer-events-none absolute top-0 z-10 rounded-control border border-line bg-surface px-2.5 py-1.5 text-xs shadow-sm"
              style={{
                left: `${((active + 0.5) / days.length) * 100}%`,
                transform: `translateX(${active > days.length / 2 ? '-100%' : '0'})`,
              }}
            >
              <p className="text-sm font-semibold text-ink tabular-nums">
                {formatNumber(hovered.events)} event
              </p>
              <p className="text-muted">Ngày {shortDay(hovered.day)}</p>
            </div>
          ) : null}
        </div>
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted hover:text-ink">Xem dạng bảng</summary>
        <table className="mt-2 w-full max-w-sm text-left">
          <thead className="text-muted">
            <tr>
              <th scope="col" className="py-1 font-normal">
                Ngày
              </th>
              <th scope="col" className="py-1 text-right font-normal">
                Event
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {days.map((item) => (
              <tr key={item.day} className="border-t border-line">
                <td className="py-1">{shortDay(item.day)}</td>
                <td className="py-1 text-right">{formatNumber(item.events)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
