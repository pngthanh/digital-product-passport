import { createHash } from 'node:crypto';
import {
  EVIDENCE_FILE_TYPES,
  EVIDENCE_MAX_BYTES,
  type EvidenceFile,
  type EvidenceMimeType,
  isEvidenceMimeType,
} from '@dpp/shared';
import { DomainError } from '../domain/domain-error.js';

/** File người dùng tải lên (multer, lưu trong bộ nhớ). */
export interface UploadedEvidence {
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** File đã kiểm tra: loại file cho phép, không rỗng, không quá giới hạn. */
export interface CheckedEvidence extends EvidenceFile {
  content: Buffer;
}

export class EvidenceFileError extends DomainError {
  readonly code = 'EVIDENCE_FILE';
  readonly kind = 'invalid';

  constructor() {
    super(
      `File biên bản phải là ảnh JPEG, PNG, WebP hoặc PDF, tối đa ${EVIDENCE_MAX_BYTES / 1024 / 1024} MB.`,
    );
  }
}

export function sha256Hex(content: Buffer): string {
  return `0x${createHash('sha256').update(content).digest('hex')}`;
}

/** Chữ ký đầu file theo loại: không nhận file đổi đuôi (ví dụ .exe đổi thành .pdf). */
const MAGIC_BYTES: Readonly<Record<EvidenceMimeType, readonly (readonly [number, number[]])[]>> = {
  'image/jpeg': [[0, [0xff, 0xd8, 0xff]]],
  'image/png': [[0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]],
  'image/webp': [
    [0, [0x52, 0x49, 0x46, 0x46]],
    [8, [0x57, 0x45, 0x42, 0x50]],
  ],
  'application/pdf': [[0, [0x25, 0x50, 0x44, 0x46, 0x2d]]],
};

function hasMagicBytes(content: Buffer, mimeType: EvidenceMimeType): boolean {
  return MAGIC_BYTES[mimeType].every(([offset, bytes]) =>
    bytes.every((byte, index) => content[offset + index] === byte),
  );
}

/** Kiểm tra loại file khai báo, chữ ký đầu file và kích thước; sai thì ném `EvidenceFileError`. */
export function checkEvidence(file: UploadedEvidence): CheckedEvidence {
  const mimeType = file.mimetype.toLowerCase();
  if (
    !isEvidenceMimeType(mimeType) ||
    file.size <= 0 ||
    file.size > EVIDENCE_MAX_BYTES ||
    file.buffer.length !== file.size ||
    !hasMagicBytes(file.buffer, mimeType)
  ) {
    throw new EvidenceFileError();
  }
  return { sha256: sha256Hex(file.buffer), mimeType, content: file.buffer };
}

/** Khoá file theo nội dung: <thư mục>/<yêu cầu>/<sha256>.<đuôi>. */
export function evidenceKey(folder: string, requestId: string, file: EvidenceFile): string {
  return `${folder}/${requestId}/${file.sha256.slice(2)}.${EVIDENCE_FILE_TYPES[file.mimeType]}`;
}

/** Loại file suy ra từ đuôi của khoá; `null` với khoá lạ. */
export function mimeTypeOfKey(key: string): EvidenceMimeType | null {
  const extension = key.split('.').at(-1);
  const entry = Object.entries(EVIDENCE_FILE_TYPES).find(([, ext]) => ext === extension);
  return entry && isEvidenceMimeType(entry[0]) ? entry[0] : null;
}

/** File đã lưu (nội dung, loại) theo khoá; dùng để băm lại khi đối chiếu hash. */
export async function storedEvidence(
  storage: { read(key: string): Promise<Buffer | null> },
  key: string | null,
): Promise<EvidenceFile | null | 'missing'> {
  if (!key) {
    return null;
  }
  const mimeType = mimeTypeOfKey(key);
  const content = await storage.read(key);
  return mimeType && content ? { sha256: sha256Hex(content), mimeType } : 'missing';
}
