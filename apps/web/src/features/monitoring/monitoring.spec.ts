import type { AnomalyAlertView } from '@dpp/shared';
import { describe, expect, it } from 'vitest';
import { alertHeadline, detailDisplay } from './alert-text';
import { niceScale, percentOf, shortDay } from './chart-scale';
import { ruleLabelOf } from './monitoring-labels';
import { anomalyAlertSchema, reviewFormSchema } from './monitoring.schema';

function alert(ruleCode: string, details: AnomalyAlertView['details']): AnomalyAlertView {
  return {
    id: '019a0000-0000-7000-8000-000000000001',
    ruleCode,
    severity: 'HIGH',
    status: 'OPEN',
    detectedAt: '2026-11-14T05:00:00.000Z',
    product: null,
    party: null,
    details,
    review: null,
  };
}

describe('AUD-02: trục biểu đồ', () => {
  it('vạch tròn 1-2-5, số nguyên, đủ chứa giá trị lớn nhất', () => {
    expect(niceScale(0)).toEqual({ max: 4, ticks: [0, 1, 2, 3, 4] });
    expect(niceScale(3)).toEqual({ max: 3, ticks: [0, 1, 2, 3] });
    expect(niceScale(37)).toEqual({ max: 40, ticks: [0, 10, 20, 30, 40] });
    expect(niceScale(130)).toEqual({ max: 150, ticks: [0, 50, 100, 150] });
    expect(niceScale(9)).toEqual({ max: 10, ticks: [0, 5, 10] });
  });

  it('ngày ngắn và phần trăm', () => {
    expect(shortDay('2026-11-04')).toBe('04/11');
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(5, 0)).toBe(0);
  });
});

describe('AUD-04: hiển thị cảnh báo', () => {
  it('tóm tắt một dòng theo luật chạy nền', () => {
    expect(
      alertHeadline(
        alert('SIGN_IN_BRUTE_FORCE', { email: 'an@gmail.com', failures: 12, windowMinutes: 15 }),
      ),
    ).toBe('an@gmail.com sai 12 lần trong 15 phút');
    expect(
      alertHeadline(
        alert('TRANSACTION_STUCK', { method: 'sellAndActivateWarranty', waitingMinutes: 40 }),
      ),
    ).toBe('sellAndActivateWarranty · chờ 40 phút');
    expect(alertHeadline(alert('REQUEST_STALE', { kind: 'INSPECTION', waitingDays: 20 }))).toBe(
      'Yêu cầu kiểm định chờ 20 ngày',
    );
    expect(
      alertHeadline(alert('PRODUCT_STATE_MISMATCH', { eventName: 'ProductStateChanged' })),
    ).toBe('Event ProductStateChanged');
    expect(ruleLabelOf('LUAT_MOI').title).toBe('LUAT_MOI');
  });

  it('giá trị chi tiết: giao dịch, ví mở explorer; thời gian, có/không dễ đọc', () => {
    const tx = `0x${'ab'.repeat(32)}`;
    expect(detailDisplay('txHash', tx)).toEqual({ kind: 'tx', value: tx });
    expect(detailDisplay('metadataHash', tx)).toEqual({ kind: 'hash', value: tx });
    expect(detailDisplay('wallet', `0x${'11'.repeat(20)}`).kind).toBe('address');
    expect(detailDisplay('submittedAt', '2026-11-14T05:00:00.000Z').kind).toBe('time');
    expect(detailDisplay('accountExists', true)).toEqual({ kind: 'text', value: 'Có' });
    expect(detailDisplay('kind', 'SERVICE')).toEqual({ kind: 'text', value: 'Bảo hành' });
    expect(detailDisplay('changes', null)).toEqual({ kind: 'text', value: 'Không có' });
  });

  it('form xử lý: bắt buộc kết luận và ghi chú 5–1000 ký tự sau khi bỏ khoảng trắng', () => {
    expect(
      reviewFormSchema.safeParse({ decision: 'DISMISSED', note: '  Báo nhầm, thử nghiệm.  ' }).data,
    ).toEqual({
      decision: 'DISMISSED',
      note: 'Báo nhầm, thử nghiệm.',
    });
    const missing = reviewFormSchema.safeParse({ note: '    ok   ' });
    expect(missing.error?.issues.map((issue) => issue.path[0])).toEqual(['decision', 'note']);
    expect(
      reviewFormSchema.safeParse({ decision: 'ACKNOWLEDGED', note: 'x'.repeat(1001) }).success,
    ).toBe(false);
  });

  it('schema cảnh báo nhận đúng phản hồi API, từ chối mức độ lạ', () => {
    expect(
      anomalyAlertSchema.safeParse(alert('INDEXER_LAGGING', { behindMinutes: 25 })).success,
    ).toBe(true);
    expect(
      anomalyAlertSchema.safeParse({ ...alert('INDEXER_LAGGING', {}), severity: 'CRITICAL' })
        .success,
    ).toBe(false);
  });
});
