/*
 * WarrantyManager (M6): bảo hành bắt đầu khi bán. Hạn bảo hành cộng theo tháng lịch Việt Nam,
 * giống hệt `VietnamCalendar.addMonths` trong contract (test contract đối chiếu hai bên).
 */

export const WARRANTY_MANAGER_CONTRACT_NAME = 'WarrantyManager';

const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * `from` cộng `months` tháng theo lịch UTC+7, giữ nguyên giờ; ngày không có ở tháng đích thì lấy
 * ngày cuối tháng (31/01 + 1 tháng = 28/02 hoặc 29/02).
 */
export function addWarrantyMonths(from: Date, months: number): Date {
  const local = new Date(from.getTime() + VIETNAM_UTC_OFFSET_MS);
  const monthIndex = local.getUTCFullYear() * 12 + local.getUTCMonth() + months;
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex % 12;
  const day = Math.min(local.getUTCDate(), daysInMonth(year, month));
  const result = Date.UTC(
    year,
    month,
    day,
    local.getUTCHours(),
    local.getUTCMinutes(),
    local.getUTCSeconds(),
    local.getUTCMilliseconds(),
  );
  return new Date(result - VIETNAM_UTC_OFFSET_MS);
}
