import { describe, expect, it } from 'vitest';
import { formatMon, parseMon } from './mon.js';

describe('MON', () => {
  it('phí đăng ký 8 MON tương ứng 8 × 10^18 wei', () => {
    expect(parseMon('8')).toBe(8_000_000_000_000_000_000n);
  });

  it('hiển thị gas nhỏ mà không mất độ chính xác', () => {
    // gas limit 300.000 × 100 gwei = 0,03 MON
    expect(formatMon(300_000n * 100_000_000_000n)).toBe('0.03');
  });

  it('cắt phần thập phân theo số chữ số yêu cầu', () => {
    expect(formatMon(parseMon('1.123456'), 2)).toBe('1.12');
    expect(formatMon(parseMon('8'))).toBe('8');
  });
});
