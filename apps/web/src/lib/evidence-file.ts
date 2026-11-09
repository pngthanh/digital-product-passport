import { EVIDENCE_FILE_TYPES, EVIDENCE_MAX_BYTES, isEvidenceMimeType } from '@dpp/shared';
import { z } from 'zod';

/** Loại file biên bản trả về từ API (ảnh JPEG, PNG, WebP hoặc PDF). */
export const evidenceFileTypeSchema = z.enum(
  Object.keys(EVIDENCE_FILE_TYPES) as [
    keyof typeof EVIDENCE_FILE_TYPES,
    ...(keyof typeof EVIDENCE_FILE_TYPES)[],
  ],
);

/** Thuộc tính `accept` của ô chọn file biên bản. */
export const EVIDENCE_ACCEPT = Object.keys(EVIDENCE_FILE_TYPES).join(',');

/** Kiểm tra file trước khi tải lên, cùng quy tắc với API (ảnh JPEG, PNG, WebP hoặc PDF, ≤ 5 MB). */
export function evidenceFileError(file: File | null): string | null {
  if (!file) {
    return null;
  }
  if (!isEvidenceMimeType(file.type) || file.size === 0) {
    return 'Chỉ nhận ảnh JPEG, PNG, WebP hoặc file PDF.';
  }
  if (file.size > EVIDENCE_MAX_BYTES) {
    return `File tối đa ${EVIDENCE_MAX_BYTES / 1024 / 1024} MB.`;
  }
  return null;
}
