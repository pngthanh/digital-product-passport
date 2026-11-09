import { describe, expect, it } from 'vitest';
import { evidenceFileError } from './evidence-file';

function file(type: string, size: number): File {
  return new File([new Uint8Array(size)], 'bien-ban', { type });
}

describe('evidenceFileError', () => {
  it('không có file thì hợp lệ (file biên bản không bắt buộc)', () => {
    expect(evidenceFileError(null)).toBeNull();
  });

  it('nhận ảnh JPEG, PNG, WebP và PDF tới 5 MB', () => {
    expect(evidenceFileError(file('image/png', 1024))).toBeNull();
    expect(evidenceFileError(file('application/pdf', 5 * 1024 * 1024))).toBeNull();
  });

  it('chặn loại file khác, file rỗng và file quá 5 MB', () => {
    expect(evidenceFileError(file('image/gif', 10))).toMatch(/JPEG, PNG, WebP/);
    expect(evidenceFileError(file('image/png', 0))).toMatch(/JPEG, PNG, WebP/);
    expect(evidenceFileError(file('image/jpeg', 5 * 1024 * 1024 + 1))).toMatch(/5 MB/);
  });
});
