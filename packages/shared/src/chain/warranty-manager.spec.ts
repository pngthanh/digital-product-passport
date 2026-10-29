import { describe, expect, it } from 'vitest';
import { addWarrantyMonths } from './warranty-manager.js';

describe('Hạn bảo hành theo lịch Việt Nam', () => {
  it('giữ ngày và giờ Việt Nam, kể cả khi ngày UTC khác ngày Việt Nam', () => {
    // 15/10/2026 09:30 (VN) + 24 tháng.
    expect(addWarrantyMonths(new Date('2026-10-15T02:30:00Z'), 24).toISOString()).toBe(
      '2028-10-15T02:30:00.000Z',
    );
    // 01/11/2026 03:00 (VN) là 31/10 theo UTC: vẫn ra 01/12 theo giờ VN.
    expect(addWarrantyMonths(new Date('2026-10-31T20:00:00Z'), 1).toISOString()).toBe(
      '2026-11-30T20:00:00.000Z',
    );
  });

  it('ngày cuối tháng thì lấy ngày cuối tháng đích, tính cả năm nhuận', () => {
    expect(addWarrantyMonths(new Date('2027-01-31T03:00:00Z'), 1).toISOString()).toBe(
      '2027-02-28T03:00:00.000Z',
    );
    expect(addWarrantyMonths(new Date('2028-01-31T03:00:00Z'), 1).toISOString()).toBe(
      '2028-02-29T03:00:00.000Z',
    );
    expect(addWarrantyMonths(new Date('2026-12-15T03:00:00Z'), 13).toISOString()).toBe(
      '2028-01-15T03:00:00.000Z',
    );
  });
});
