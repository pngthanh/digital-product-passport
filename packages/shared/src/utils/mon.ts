import { formatEther, parseEther } from 'ethers';

export const MON_SYMBOL = 'MON';

/** Chuyển chuỗi MON (ví dụ "8" hoặc "0.05") sang wei. */
export function parseMon(value: string): bigint {
  return parseEther(value.trim());
}

/**
 * Hiển thị số wei dưới dạng MON, cắt bớt phần thập phân dư.
 * Không dùng Number để tránh mất độ chính xác với số lớn.
 */
export function formatMon(wei: bigint, maxFractionDigits = 4): string {
  const [whole = '0', fraction = ''] = formatEther(wei).split('.');
  const trimmedFraction = fraction.slice(0, maxFractionDigits).replace(/0+$/, '');
  return trimmedFraction.length > 0 ? `${whole}.${trimmedFraction}` : whole;
}
