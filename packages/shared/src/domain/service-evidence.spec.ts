import { describe, expect, it } from 'vitest';
import { isEvidenceMimeType } from './evidence-file.js';
import { type ServiceEvidence, serviceEvidenceHash } from './service-evidence.js';

const BASE: ServiceEvidence = {
  ticketId: `0x${'ab'.repeat(32)}`,
  repaired: true,
  actionCode: 'REPLACE_PART',
  actionDetail: 'Thay bo mạch nguồn',
  file: { sha256: `0x${'cd'.repeat(32)}`, mimeType: 'image/jpeg' },
};

describe('serviceEvidenceHash', () => {
  it('ổn định, không phân biệt hoa thường của ticketId và sha256', () => {
    const upper = {
      ...BASE,
      ticketId: BASE.ticketId.toUpperCase().replace('0X', '0x'),
      file: { sha256: BASE.file!.sha256.toUpperCase().replace('0X', '0x'), mimeType: 'image/jpeg' },
    } satisfies ServiceEvidence;
    expect(serviceEvidenceHash(upper)).toBe(serviceEvidenceHash(BASE));
    expect(serviceEvidenceHash(BASE)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('đổi kết quả, nội dung hay file thì hash đổi', () => {
    const original = serviceEvidenceHash(BASE);
    expect(serviceEvidenceHash({ ...BASE, repaired: false })).not.toBe(original);
    expect(serviceEvidenceHash({ ...BASE, actionDetail: 'Thay tụ nguồn' })).not.toBe(original);
    expect(serviceEvidenceHash({ ...BASE, actionCode: 'REPAIR' })).not.toBe(original);
    expect(serviceEvidenceHash({ ...BASE, file: null })).not.toBe(original);
    expect(
      serviceEvidenceHash({ ...BASE, file: { ...BASE.file!, sha256: `0x${'ce'.repeat(32)}` } }),
    ).not.toBe(original);
  });

  it('chỉ nhận ảnh JPEG, PNG, WebP và PDF', () => {
    expect(isEvidenceMimeType('image/png')).toBe(true);
    expect(isEvidenceMimeType('application/pdf')).toBe(true);
    expect(isEvidenceMimeType('image/gif')).toBe(false);
    expect(isEvidenceMimeType('toString')).toBe(false);
  });
});
