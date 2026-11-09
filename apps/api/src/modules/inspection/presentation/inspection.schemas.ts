import {
  extractPublicCode,
  INSPECTION_DECLINE_REASON_MAX_LENGTH,
  INSPECTION_NOTE_MAX_LENGTH,
  INSPECTION_SUMMARY_MAX_LENGTH,
  InspectionResult,
} from '@dpp/shared';
import { z } from 'zod';

export const inspectionIdSchema = z.uuid('Mã không hợp lệ');

/** Mã trên tem: nhận cả dạng có gạch nối hoặc đường dẫn quét được (giống tra cứu hộ chiếu). */
export const publicCodeSchema = z.string().transform((value, context) => {
  const code = extractPublicCode(value);
  if (!code) {
    context.addIssue({ code: 'custom', message: 'Mã tra cứu không hợp lệ' });
    return z.NEVER;
  }
  return code;
});

/** INS-02: chọn đơn vị kiểm định và ghi nội dung cần kiểm định. */
export const inspectionRequestSchema = z.object({
  inspectorOrgId: z.uuid('Chọn đơn vị kiểm định'),
  note: z
    .string('Ghi nội dung cần kiểm định')
    .trim()
    .min(1, 'Ghi nội dung cần kiểm định')
    .max(INSPECTION_NOTE_MAX_LENGTH, `Nội dung tối đa ${INSPECTION_NOTE_MAX_LENGTH} ký tự`),
});
export type InspectionRequestBody = z.infer<typeof inspectionRequestSchema>;

/** INS-01: các ô của form multipart đều là chuỗi. */
export const inspectionResultSchema = z.object({
  result: z.enum(Object.values(InspectionResult), 'Chọn kết quả kiểm định'),
  summary: z
    .string('Ghi tóm tắt kết luận')
    .trim()
    .min(1, 'Ghi tóm tắt kết luận')
    .max(INSPECTION_SUMMARY_MAX_LENGTH, `Tóm tắt tối đa ${INSPECTION_SUMMARY_MAX_LENGTH} ký tự`),
});
export type InspectionResultBody = z.infer<typeof inspectionResultSchema>;

/** INS-04: lý do từ chối. */
export const inspectionDeclineSchema = z.object({
  reason: z
    .string('Ghi lý do từ chối')
    .trim()
    .min(1, 'Ghi lý do từ chối')
    .max(
      INSPECTION_DECLINE_REASON_MAX_LENGTH,
      `Lý do tối đa ${INSPECTION_DECLINE_REASON_MAX_LENGTH} ký tự`,
    ),
});
export type InspectionDeclineBody = z.infer<typeof inspectionDeclineSchema>;

export const inspectionTransactionSchema = z.object({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Mã giao dịch không hợp lệ'),
});
export type InspectionTransactionBody = z.infer<typeof inspectionTransactionSchema>;

export const inspectionListQuerySchema = z.object({
  filter: z.enum(['REQUESTED', 'COMPLETED', 'CLOSED']).catch('REQUESTED'),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
});
export type InspectionListQuery = z.infer<typeof inspectionListQuerySchema>;
