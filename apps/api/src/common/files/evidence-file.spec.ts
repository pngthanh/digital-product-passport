import { checkEvidence, EvidenceFileError, evidenceKey, mimeTypeOfKey } from './evidence-file.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const PDF = Buffer.from('%PDF-1.7\n');

function upload(mimetype: string, buffer: Buffer) {
  return { mimetype, size: buffer.length, buffer };
}

describe('file biên bản', () => {
  it('nhận ảnh và PDF đúng chữ ký đầu file, tính sha256', () => {
    const checked = checkEvidence(upload('image/PNG', PNG));
    expect(checked.mimeType).toBe('image/png');
    expect(checked.sha256).toMatch(/^0x[0-9a-f]{64}$/);
    expect(checkEvidence(upload('application/pdf', PDF)).mimeType).toBe('application/pdf');
  });

  it('chặn file đổi đuôi, loại không hỗ trợ và file rỗng', () => {
    expect(() => checkEvidence(upload('application/pdf', PNG))).toThrow(EvidenceFileError);
    expect(() => checkEvidence(upload('image/gif', PNG))).toThrow(EvidenceFileError);
    expect(() => checkEvidence(upload('image/png', Buffer.alloc(0)))).toThrow(EvidenceFileError);
  });

  it('khoá file theo thư mục, yêu cầu và nội dung; đọc lại được loại file', () => {
    const file = checkEvidence(upload('image/png', PNG));
    const key = evidenceKey('inspection-reports', 'abc', file);
    expect(key).toBe(`inspection-reports/abc/${file.sha256.slice(2)}.png`);
    expect(mimeTypeOfKey(key)).toBe('image/png');
    expect(mimeTypeOfKey('x/y.exe')).toBeNull();
  });
});
