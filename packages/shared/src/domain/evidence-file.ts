/*
 * File đính kèm biên bản (ảnh hoặc PDF) dùng chung cho biên bản sửa chữa (M7) và biên bản kiểm định
 * (M8). File lưu trên máy chủ; chỉ sha256 của nội dung và loại file đi vào hash ghi on-chain.
 */

/** File biên bản tối đa 5 MB. */
export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;

/** Loại file nhận được và đuôi file lưu trên máy chủ. */
export const EVIDENCE_FILE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
} as const;
export type EvidenceMimeType = keyof typeof EVIDENCE_FILE_TYPES;

export function isEvidenceMimeType(value: string): value is EvidenceMimeType {
  return Object.hasOwn(EVIDENCE_FILE_TYPES, value);
}

/** Tên file không đi vào hash, chỉ nội dung (sha256) và loại file. */
export interface EvidenceFile {
  /** sha256 của nội dung file, dạng 0x + 64 ký tự hex. */
  sha256: string;
  mimeType: EvidenceMimeType;
}

/** Dạng chuẩn của file trong JSON biên bản trước khi băm. */
export function canonicalEvidenceFile(
  file: EvidenceFile | null,
): { sha256: string; mimeType: EvidenceMimeType } | null {
  return file ? { sha256: file.sha256.toLowerCase(), mimeType: file.mimeType } : null;
}
