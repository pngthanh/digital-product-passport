import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { LIFECYCLE_MACHINES } from './lifecycle-machines';

/** Bốn state machine độc lập, vẽ từ bảng chuyển trạng thái dùng chung với API và contract. */
export function LifecycleOverview() {
  return (
    <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
      {LIFECYCLE_MACHINES.map((machine) => (
        <li
          key={machine.title}
          className="grid gap-4 px-5 py-5 md:grid-cols-[minmax(0,14rem)_1fr] md:gap-8"
        >
          <div>
            <h3 className="font-medium">{machine.title}</h3>
            <p className="mt-1 text-sm text-muted">{machine.description}</p>
          </div>
          <div className="grid content-start gap-3">
            <ol
              className="flex flex-wrap items-center gap-1.5"
              aria-label={`Đường chính của ${machine.title}`}
            >
              {machine.mainPath.map((state, index) => (
                <li key={`${state}-${index}`} className="flex items-center gap-1.5">
                  {index > 0 ? <ChevronRight aria-hidden className="size-4 text-muted" /> : null}
                  <Badge tone={machine.labels[state]?.tone}>
                    {machine.labels[state]?.label ?? state}
                  </Badge>
                </li>
              ))}
            </ol>
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
              <span>Kết thúc khác:</span>
              {machine.otherEndings.map((state) => (
                <Badge key={state} tone={machine.labels[state]?.tone}>
                  {machine.labels[state]?.label ?? state}
                </Badge>
              ))}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
