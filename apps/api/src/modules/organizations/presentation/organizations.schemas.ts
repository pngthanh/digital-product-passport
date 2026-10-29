import {
  CONTACT_PHONE_PATTERN,
  EMAIL_MAX_LENGTH,
  ORGANIZATION_ADDRESS_MAX_LENGTH,
  ORGANIZATION_NAME_MAX_LENGTH,
  OrgType,
  STATUS_REASON_MAX_LENGTH,
  TAX_CODE_PATTERN,
} from '@dpp/shared';
import { z } from 'zod';

const ORGANIZATION_STAGES = ['DRAFT', 'PENDING', 'AUTHORIZED', 'REJECTED', 'DISABLED'] as const;
const ADMIN_METHODS = [
  'approveOrganization',
  'rejectOrganization',
  'disableOrganization',
  'setFee',
  'setTreasury',
] as const;

const txHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Mã giao dịch không hợp lệ');

/** Chuỗi rỗng sau khi bỏ khoảng trắng coi như không nhập. */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((value) => (value ? value : null));

export const organizationApplicationSchema = z.object({
  name: z
    .string('Nhập tên doanh nghiệp')
    .trim()
    .min(1, 'Nhập tên doanh nghiệp')
    .max(ORGANIZATION_NAME_MAX_LENGTH, `Tên tối đa ${ORGANIZATION_NAME_MAX_LENGTH} ký tự`),
  taxCode: z
    .string('Nhập mã số thuế')
    .trim()
    .regex(
      TAX_CODE_PATTERN,
      'Mã số thuế gồm 10 chữ số, chi nhánh thêm -xxx (ví dụ 0312345678-001)',
    ),
  orgType: z.enum(Object.values(OrgType), 'Chọn loại doanh nghiệp'),
  contactEmail: z
    .string('Nhập email liên hệ')
    .trim()
    .max(EMAIL_MAX_LENGTH, `Email tối đa ${EMAIL_MAX_LENGTH} ký tự`)
    .pipe(z.email('Email không hợp lệ')),
  contactPhone: z
    .string()
    .nullish()
    .transform((value) => value?.replace(/[\s.()-]/g, '') || null)
    .refine((value) => value === null || CONTACT_PHONE_PATTERN.test(value), {
      message: 'Số điện thoại gồm 8–15 chữ số',
    }),
  address: optionalText(
    ORGANIZATION_ADDRESS_MAX_LENGTH,
    `Địa chỉ tối đa ${ORGANIZATION_ADDRESS_MAX_LENGTH} ký tự`,
  ),
});

export const organizationTransactionSchema = z.object({
  txHash,
  kind: z.enum(['applyOrganization', 'withdrawRefund'], 'Loại giao dịch không hợp lệ'),
});

export const stageListSchema = z
  .string()
  .optional()
  .transform((value) => (value ? value.split(',').map((stage) => stage.trim()) : []))
  .pipe(z.array(z.enum(ORGANIZATION_STAGES, 'Giai đoạn không hợp lệ')));

export const organizationIdSchema = z.uuid('Mã doanh nghiệp không hợp lệ');

export const adminDecisionSchema = z.object({
  decision: z.enum(['REJECT', 'DISABLE'], 'Quyết định phải là REJECT hoặc DISABLE'),
  reason: z
    .string('Nhập lý do')
    .trim()
    .min(1, 'Nhập lý do')
    .max(STATUS_REASON_MAX_LENGTH, `Lý do tối đa ${STATUS_REASON_MAX_LENGTH} ký tự`),
});

export const adminTransactionSchema = z.object({
  txHash,
  method: z.enum(ADMIN_METHODS, 'Hàm quản trị không hợp lệ'),
});

export type OrganizationApplicationBody = z.infer<typeof organizationApplicationSchema>;
export type OrganizationTransactionBody = z.infer<typeof organizationTransactionSchema>;
export type AdminDecisionBody = z.infer<typeof adminDecisionSchema>;
export type AdminTransactionBody = z.infer<typeof adminTransactionSchema>;
