import { keccak256, toUtf8Bytes } from 'ethers';
import type { InspectionResult } from './enums.js';
import { canonicalEvidenceFile, type EvidenceFile } from './evidence-file.js';

/*
 * Biên bản kiểm định (M8, INS-01) dùng chung cho API và Web. Hash biên bản được ghi lên
 * InspectionRegistry, nên hai phía phải chuẩn hoá và băm giống hệt.
 */

/** Nội dung nhà sản xuất hoặc chủ sở hữu muốn kiểm định. */
export const INSPECTION_NOTE_MAX_LENGTH = 1000;
export const INSPECTION_SUMMARY_MAX_LENGTH = 2000;
export const INSPECTION_DECLINE_REASON_MAX_LENGTH = 500;

export interface InspectionReport {
  /** inspectionId (bytes32) của yêu cầu. */
  inspectionId: string;
  result: InspectionResult;
  /** Tóm tắt kết luận của đơn vị kiểm định. */
  summary: string;
  file: EvidenceFile | null;
}

/** keccak256 của JSON biên bản với thứ tự khoá cố định; đổi kết quả, tóm tắt hay file thì hash đổi. */
export function inspectionReportHash(report: InspectionReport): string {
  const canonical = JSON.stringify({
    version: 1,
    kind: 'inspection',
    inspectionId: report.inspectionId.toLowerCase(),
    result: report.result,
    summary: report.summary,
    file: canonicalEvidenceFile(report.file),
  });
  return keccak256(toUtf8Bytes(canonical));
}
