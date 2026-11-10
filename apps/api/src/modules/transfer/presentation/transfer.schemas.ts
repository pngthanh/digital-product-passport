import { TRANSFER_DEFAULT_DAYS, TRANSFER_MAX_DAYS, TRANSFER_MIN_DAYS } from '@dpp/shared';
import { z } from 'zod';

export const transferIdSchema = z.uuid('Mã không hợp lệ');

const recipient = z
  .string('Nhập email hoặc mã số thuế của bên nhận')
  .trim()
  .min(1, 'Nhập email hoặc mã số thuế của bên nhận')
  .max(320, 'Email hoặc mã số thuế quá dài');

export const transferRecipientSchema = z.object({ recipient });
export type TransferRecipientBody = z.infer<typeof transferRecipientSchema>;

export const transferAuthorizationSchema = z.object({
  recipient,
  days: z.coerce
    .number('Chọn số ngày')
    .int('Số ngày là số nguyên')
    .min(TRANSFER_MIN_DAYS, `Tối thiểu ${TRANSFER_MIN_DAYS} ngày`)
    .max(TRANSFER_MAX_DAYS, `Tối đa ${TRANSFER_MAX_DAYS} ngày`)
    .default(TRANSFER_DEFAULT_DAYS),
});
export type TransferAuthorizationBody = z.infer<typeof transferAuthorizationSchema>;

export const transferTransactionSchema = z.object({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Mã giao dịch không hợp lệ'),
});
export type TransferTransactionBody = z.infer<typeof transferTransactionSchema>;

export const transferListQuerySchema = z.object({
  filter: z.enum(['INCOMING', 'OUTGOING', 'CLOSED']).catch('INCOMING'),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
});
export type TransferListQuery = z.infer<typeof transferListQuerySchema>;
