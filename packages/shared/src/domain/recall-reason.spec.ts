import { describe, expect, it } from 'vitest';
import { normalizeRecallReason, recallReasonHash } from './recall-reason.js';

describe('recall reason', () => {
  it('chuẩn hoá khoảng trắng đầu cuối, xuống dòng và Unicode trước khi băm', () => {
    const decomposed = '  Pin có nguy cơ phồng\r\nkhi sạc nhanh  ';
    expect(normalizeRecallReason(decomposed)).toBe('Pin có nguy cơ phồng\nkhi sạc nhanh');
    expect(recallReasonHash(decomposed)).toBe(
      recallReasonHash('Pin có nguy cơ phồng\nkhi sạc nhanh'),
    );
  });

  it('đổi một ký tự thì hash đổi; hash là bytes32 chữ thường', () => {
    const hash = recallReasonHash('Pin có nguy cơ phồng khi sạc nhanh.');
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(recallReasonHash('Pin có nguy cơ phồng khi sạc nhanh!')).not.toBe(hash);
  });
});
