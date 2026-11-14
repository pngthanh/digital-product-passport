/** Trục số "đẹp" cho biểu đồ cột: vạch là 1, 2, 5 × 10^k, tối đa khoảng `targetTicks` khoảng. */
export function niceScale(maxValue: number, targetTicks = 4): { max: number; ticks: number[] } {
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return { max: targetTicks, ticks: Array.from({ length: targetTicks + 1 }, (_, i) => i) };
  }
  const rough = maxValue / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 5, 10].map((factor) => factor * magnitude).find((value) => value >= rough) ??
    10 * magnitude;
  // Số đếm luôn nguyên: bước nhỏ nhất là 1.
  const wholeStep = Math.max(1, Math.round(step));
  const max = Math.ceil(maxValue / wholeStep) * wholeStep;
  const ticks: number[] = [];
  for (let value = 0; value <= max; value += wholeStep) {
    ticks.push(value);
  }
  return { max, ticks };
}

/** `2026-11-14` → `14/11`. */
export function shortDay(day: string): string {
  const [, month, date] = day.split('-');
  return `${date}/${month}`;
}

const COMPACT = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });
const FULL = new Intl.NumberFormat('vi-VN');

/** Dưới 10.000 viết đủ, từ 10.000 viết gọn (12,9 N). */
export function axisNumber(value: number): string {
  return value < 10_000 ? FULL.format(value) : COMPACT.format(value);
}

/** Tỉ lệ phần trăm làm tròn, `0` khi tổng bằng 0. */
export function percentOf(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}
