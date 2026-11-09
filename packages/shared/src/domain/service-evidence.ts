import { keccak256, toUtf8Bytes } from 'ethers';
import { canonicalEvidenceFile, type EvidenceFile } from './evidence-file.js';

/*
 * Biên bản sửa chữa (M7, SVC-04) dùng chung cho API và Web. Hash biên bản được ghi lên
 * ServiceTicketManager khi đóng phiếu, nên hai phía phải chuẩn hoá và băm giống hệt.
 */

export const SERVICE_ISSUE_MAX_LENGTH = 1000;
export const SERVICE_ACTION_DETAIL_MAX_LENGTH = 2000;

/** Việc trung tâm đã làm; mã lưu trong service_records.action_code. */
export const SERVICE_ACTION_CODES = [
  'REPAIR',
  'REPLACE_PART',
  'SOFTWARE_UPDATE',
  'CLEANING',
  'INSPECTION_ONLY',
  'OTHER',
] as const;
export type ServiceActionCode = (typeof SERVICE_ACTION_CODES)[number];

export interface ServiceEvidence {
  /** ticketId (bytes32) của phiếu. */
  ticketId: string;
  /** Đã sửa xong (REPAIRED) hay không sửa được (REJECTED). */
  repaired: boolean;
  actionCode: ServiceActionCode;
  actionDetail: string | null;
  file: EvidenceFile | null;
}

/** keccak256 của JSON biên bản với thứ tự khoá cố định; đổi nội dung hoặc file thì hash đổi. */
export function serviceEvidenceHash(evidence: ServiceEvidence): string {
  const canonical = JSON.stringify({
    version: 1,
    ticketId: evidence.ticketId.toLowerCase(),
    repaired: evidence.repaired,
    actionCode: evidence.actionCode,
    actionDetail: evidence.actionDetail,
    file: canonicalEvidenceFile(evidence.file),
  });
  return keccak256(toUtf8Bytes(canonical));
}
