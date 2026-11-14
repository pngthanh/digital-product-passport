import {
  extractPublicCode,
  MANUFACTURED_ON_MIN,
  MODEL_NAME_MAX_LENGTH,
  normalizeManufacturedOn,
  normalizeSerialNumber,
  PRODUCT_BATCH_MAX_SIZE,
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  SERIAL_NUMBER_MAX_LENGTH,
  SERIAL_NUMBER_PATTERN,
  todayInVietnam,
  WARRANTY_MONTHS_MAX,
} from '@dpp/shared';
import { z } from 'zod';

const txHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Mã giao dịch không hợp lệ');

export const productInputSchema = z.object({
  serialNumber: z
    .string('Nhập serial')
    .transform(normalizeSerialNumber)
    .pipe(
      z
        .string()
        .min(1, 'Nhập serial')
        .max(SERIAL_NUMBER_MAX_LENGTH, `Serial tối đa ${SERIAL_NUMBER_MAX_LENGTH} ký tự`)
        .regex(SERIAL_NUMBER_PATTERN, 'Serial chỉ gồm chữ, số và . _ / - (không có khoảng trắng)'),
    ),
  modelName: z
    .string('Nhập tên model')
    .trim()
    .min(1, 'Nhập tên model')
    .max(MODEL_NAME_MAX_LENGTH, `Tên model tối đa ${MODEL_NAME_MAX_LENGTH} ký tự`),
  description: z
    .string()
    .trim()
    .max(PRODUCT_DESCRIPTION_MAX_LENGTH, `Mô tả tối đa ${PRODUCT_DESCRIPTION_MAX_LENGTH} ký tự`)
    .nullish()
    .transform((value) => value || null),
  manufacturedOn: z
    .string('Nhập ngày sản xuất')
    .transform((value, context) => {
      const date = normalizeManufacturedOn(value);
      if (!date) {
        context.addIssue({
          code: 'custom',
          message: 'Ngày sản xuất không hợp lệ (YYYY-MM-DD hoặc DD/MM/YYYY)',
        });
        return z.NEVER;
      }
      return date;
    })
    .refine((date) => date >= MANUFACTURED_ON_MIN, 'Ngày sản xuất phải từ năm 1990')
    .refine((date) => date <= todayInVietnam(), 'Ngày sản xuất không được ở tương lai'),
  warrantyMonths: z
    .number('Nhập số tháng bảo hành')
    .int('Số tháng bảo hành là số nguyên')
    .min(0, 'Số tháng bảo hành không âm')
    .max(WARRANTY_MONTHS_MAX, `Bảo hành tối đa ${WARRANTY_MONTHS_MAX} tháng`),
});

export const productRegistrationSchema = z.object({
  items: z
    .array(productInputSchema)
    .min(1, 'Cần ít nhất một sản phẩm')
    .max(PRODUCT_BATCH_MAX_SIZE, `Mỗi lần đăng ký tối đa ${PRODUCT_BATCH_MAX_SIZE} sản phẩm`),
});
export type ProductRegistrationBody = z.infer<typeof productRegistrationSchema>;

export const productRetrySchema = z.object({
  productIds: z.array(z.uuid()).min(1).max(PRODUCT_BATCH_MAX_SIZE),
});
export type ProductRetryBody = z.infer<typeof productRetrySchema>;

export const productTransactionSchema = z.object({ txHash });
export type ProductTransactionBody = z.infer<typeof productTransactionSchema>;

export const productIdSchema = z.uuid('Mã sản phẩm không hợp lệ');

/** Mã trên tem: nhận cả dạng có gạch nối (ABCD-EFGH-JKLM) hoặc đường dẫn quét được. */
export const publicCodeSchema = z.string().transform((value, context) => {
  const code = extractPublicCode(value);
  if (!code) {
    context.addIssue({ code: 'custom', message: 'Mã tra cứu không hợp lệ' });
    return z.NEVER;
  }
  return code;
});

export const productListQuerySchema = z.object({
  filter: z.enum(['ALL', 'REGISTERED', 'DRAFT', 'RECALLED']).catch('ALL'),
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || null)
    .catch(null),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
});
export type ProductListQueryInput = z.infer<typeof productListQuerySchema>;

export const inventoryListQuerySchema = z.object({
  filter: z.enum(['INCOMING', 'IN_STOCK', 'SOLD']).catch('IN_STOCK'),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
});
export type InventoryListQueryInput = z.infer<typeof inventoryListQuerySchema>;

/** DST-03: email tài khoản của người mua. */
export const saleAuthorizationSchema = z.object({
  buyerEmail: z.string('Nhập email người mua').trim().pipe(z.email('Email không hợp lệ').max(254)),
});
export type SaleAuthorizationBody = z.infer<typeof saleAuthorizationSchema>;
