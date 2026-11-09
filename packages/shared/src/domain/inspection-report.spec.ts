import { describe, expect, it } from 'vitest';
import { type InspectionReport, inspectionReportHash } from './inspection-report.js';
import { serviceEvidenceHash } from './service-evidence.js';

const BASE: InspectionReport = {
  inspectionId: `0x${'ab'.repeat(32)}`,
  result: 'PASS',
  summary: 'Đạt tiêu chuẩn an toàn điện',
  file: { sha256: `0x${'cd'.repeat(32)}`, mimeType: 'application/pdf' },
};

describe('inspectionReportHash', () => {
  it('ổn định, không phân biệt hoa thường của inspectionId và sha256', () => {
    const upper: InspectionReport = {
      ...BASE,
      inspectionId: BASE.inspectionId.toUpperCase().replace('0X', '0x'),
      file: {
        sha256: BASE.file!.sha256.toUpperCase().replace('0X', '0x'),
        mimeType: 'application/pdf',
      },
    };
    expect(inspectionReportHash(upper)).toBe(inspectionReportHash(BASE));
    expect(inspectionReportHash(BASE)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('đổi kết quả, tóm tắt hay file thì hash đổi', () => {
    const original = inspectionReportHash(BASE);
    expect(inspectionReportHash({ ...BASE, result: 'FAIL' })).not.toBe(original);
    expect(inspectionReportHash({ ...BASE, result: 'CONDITIONAL' })).not.toBe(original);
    expect(inspectionReportHash({ ...BASE, summary: 'Đạt' })).not.toBe(original);
    expect(inspectionReportHash({ ...BASE, file: null })).not.toBe(original);
  });

  it('khác hash biên bản sửa chữa dù cùng mã và file', () => {
    const service = serviceEvidenceHash({
      ticketId: BASE.inspectionId,
      repaired: true,
      actionCode: 'INSPECTION_ONLY',
      actionDetail: BASE.summary,
      file: BASE.file,
    });
    expect(inspectionReportHash(BASE)).not.toBe(service);
  });
});
