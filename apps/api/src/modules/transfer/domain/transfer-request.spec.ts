import { isExpired, isPending, isTaxCode } from './transfer-request.js';

describe('yêu cầu chuyển nhượng', () => {
  const now = new Date('2026-11-09T03:00:00.000Z');
  const open = { transferState: 'REQUESTED' as const, expiresAt: new Date('2026-11-10T03:00:00Z') };

  it('quá hạn khi còn REQUESTED mà đã qua expiresAt', () => {
    expect(isExpired(open, now)).toBe(false);
    expect(isPending(open, now)).toBe(true);
    const late = new Date('2026-11-10T03:00:01Z');
    expect(isExpired(open, late)).toBe(true);
    expect(isPending(open, late)).toBe(false);
    expect(isExpired({ ...open, transferState: 'COMPLETED' }, late)).toBe(false);
  });

  it('nhận ra mã số thuế 10 số hoặc mã chi nhánh 13 ký tự', () => {
    expect(isTaxCode('0312345678')).toBe(true);
    expect(isTaxCode('0312345678-001')).toBe(true);
    expect(isTaxCode('031234567')).toBe(false);
    expect(isTaxCode('le.binh@gmail.com')).toBe(false);
  });
});
