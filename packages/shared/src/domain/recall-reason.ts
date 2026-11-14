import { keccak256, toUtf8Bytes } from 'ethers';

/*
 * Lý do thu hồi (M10, RCL-01) dùng chung cho API và Web. ProductLifecycle lưu hash của lý do, nên
 * hai phía phải chuẩn hoá và băm giống hệt.
 */

export const RECALL_REASON_MIN_LENGTH = 10;
export const RECALL_REASON_MAX_LENGTH = 1000;

/** Bỏ khoảng trắng đầu cuối, đổi xuống dòng về `\n`, chuẩn Unicode NFC. */
export function normalizeRecallReason(reason: string): string {
  return reason.normalize('NFC').replace(/\r\n?/g, '\n').trim();
}

/** keccak256 của JSON lý do (đã chuẩn hoá); đổi một ký tự thì hash đổi. */
export function recallReasonHash(reason: string): string {
  return keccak256(
    toUtf8Bytes(JSON.stringify({ version: 1, reason: normalizeRecallReason(reason) })),
  );
}
