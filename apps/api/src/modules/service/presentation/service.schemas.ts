import {
  SERVICE_ACTION_CODES,
  SERVICE_ACTION_DETAIL_MAX_LENGTH,
  SERVICE_ISSUE_MAX_LENGTH,
} from '@dpp/shared';
import { z } from 'zod';

export const serviceIdSchema = z.uuid('Mã không hợp lệ');

/** SVC-01: chủ sở hữu chọn trung tâm và mô tả lỗi. */
export const serviceRequestSchema = z.object({
  serviceCenterOrgId: z.uuid('Chọn trung tâm bảo hành'),
  issueDesc: z
    .string('Mô tả lỗi của sản phẩm')
    .trim()
    .min(1, 'Mô tả lỗi của sản phẩm')
    .max(SERVICE_ISSUE_MAX_LENGTH, `Mô tả tối đa ${SERVICE_ISSUE_MAX_LENGTH} ký tự`),
});
export type ServiceRequestBody = z.infer<typeof serviceRequestSchema>;

/** SVC-04: các ô của form multipart đều là chuỗi. */
export const serviceResultSchema = z.object({
  repaired: z
    .enum(['true', 'false'], 'Chọn kết quả sửa chữa')
    .transform((value) => value === 'true'),
  actionCode: z.enum(SERVICE_ACTION_CODES, 'Chọn việc đã làm'),
  actionDetail: z
    .string()
    .trim()
    .max(
      SERVICE_ACTION_DETAIL_MAX_LENGTH,
      `Nội dung tối đa ${SERVICE_ACTION_DETAIL_MAX_LENGTH} ký tự`,
    )
    .nullish()
    .transform((value) => value || null),
});
export type ServiceResultBody = z.infer<typeof serviceResultSchema>;

export const serviceTransactionSchema = z.object({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Mã giao dịch không hợp lệ'),
});
export type ServiceTransactionBody = z.infer<typeof serviceTransactionSchema>;

export const serviceTicketListQuerySchema = z.object({
  filter: z.enum(['REQUESTED', 'IN_REPAIR', 'CLOSED']).catch('REQUESTED'),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
});
export type ServiceTicketListQueryInput = z.infer<typeof serviceTicketListQuerySchema>;
