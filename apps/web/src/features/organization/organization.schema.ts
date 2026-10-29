import {
  type AdminDecisionCall,
  type AdminOrganizationList,
  type AdminOverview,
  CONTACT_PHONE_PATTERN,
  EMAIL_MAX_LENGTH,
  type FeePaymentSummary,
  type MyOrganizationView,
  ORGANIZATION_ADDRESS_MAX_LENGTH,
  ORGANIZATION_NAME_MAX_LENGTH,
  type OrganizationApplicationAuthorization,
  type OrganizationApplicationView,
  type OrganizationDetailView,
  type OrganizationHistory,
  type OrganizationSummary,
  OrgType,
  STATUS_REASON_MAX_LENGTH,
  TAX_CODE_PATTERN,
  type TrackedTransactionView,
} from '@dpp/shared';
import { z } from 'zod';
import {
  addressSchema as address,
  bytes32Schema as bytes32,
  chainEventSchema,
  isoDateSchema as isoDate,
  weiSchema as wei,
} from '@/lib/chain-schema';

const stage = z.enum(['DRAFT', 'PENDING', 'AUTHORIZED', 'REJECTED', 'DISABLED']);
const orgType = z.enum(Object.values(OrgType));

const feePolicySchema = z.object({
  action: z.enum(['ORG_REGISTRATION']),
  amountWei: wei,
  treasury: address,
});

const contractSchema = z.object({ chainId: z.number().int().positive(), address });

const feePaymentSchema: z.ZodType<FeePaymentSummary> = z.object({
  amountWei: wei,
  feeStatus: z.enum(['ESCROWED', 'SETTLED', 'REFUNDABLE', 'REFUNDED']),
  payerAddress: address,
  paidTxHash: bytes32,
  paidAt: isoDate,
  settledTxHash: bytes32.nullable(),
  refundTxHash: bytes32.nullable(),
});

/** Kiểm tra đúng hợp đồng dữ liệu của API trước khi hiển thị (không tin dữ liệu mạng). */
export const organizationSummarySchema: z.ZodType<OrganizationSummary> = z.object({
  id: z.uuid(),
  partyId: bytes32,
  name: z.string(),
  taxCode: z.string(),
  orgType,
  contactEmail: z.string(),
  contactPhone: z.string().nullable(),
  address: z.string().nullable(),
  profileHash: bytes32.nullable(),
  stage,
  statusReason: z.string().nullable(),
  appliedAt: isoDate.nullable(),
  approvedAt: isoDate.nullable(),
  rejectedAt: isoDate.nullable(),
  disabledAt: isoDate.nullable(),
  representative: z.object({ userId: z.uuid(), fullName: z.string(), email: z.string() }),
  feePayments: z.array(feePaymentSchema),
  refundableWei: wei,
});

const applicationSchema: z.ZodType<OrganizationApplicationView> = z.object({
  round: z.number().int().positive(),
  status: z.enum(['PENDING', 'AUTHORIZED', 'REJECTED']),
  orgType,
  profile: z
    .object({
      name: z.string(),
      taxCode: z.string(),
      orgType,
      contactEmail: z.string(),
      contactPhone: z.string().nullable(),
      address: z.string().nullable(),
    })
    .nullable(),
  profileHash: bytes32,
  profileMatchesChain: z.boolean().nullable(),
  applicantAddress: address,
  appliedTxHash: bytes32,
  appliedAt: isoDate,
  fee: feePaymentSchema.nullable(),
  decisionReason: z.string().nullable(),
  decisionReasonHash: bytes32.nullable(),
  reasonMatchesChain: z.boolean().nullable(),
  decidedByAddress: address.nullable(),
  decidedTxHash: bytes32.nullable(),
  decidedAt: isoDate.nullable(),
});

const historySchema: z.ZodType<OrganizationHistory> = z.object({
  applications: z.array(applicationSchema),
  chainLog: z.array(chainEventSchema),
});

export const myOrganizationSchema: z.ZodType<MyOrganizationView> = z.object({
  organization: organizationSummarySchema.nullable(),
  history: historySchema,
  registrationFee: feePolicySchema.nullable(),
  contract: contractSchema.nullable(),
});

export const organizationDetailSchema: z.ZodType<OrganizationDetailView> = z.object({
  organization: organizationSummarySchema,
  applications: z.array(applicationSchema),
  chainLog: z.array(chainEventSchema),
  contract: contractSchema.nullable(),
});

export const applicationAuthorizationSchema: z.ZodType<OrganizationApplicationAuthorization> =
  z.object({
    organizationId: z.uuid(),
    method: z.literal('applyOrganization'),
    chainId: z.number().int().positive(),
    contractAddress: address,
    partyId: bytes32,
    representativeId: bytes32,
    role: bytes32,
    profileHash: bytes32,
    wallet: address,
    feeWei: wei,
    deadline: z.string().regex(/^\d+$/),
    signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
  });

export const trackedTransactionSchema: z.ZodType<TrackedTransactionView> = z.object({
  txHash: bytes32,
  status: z.enum(['SUBMITTED', 'CONFIRMED', 'REVERTED', 'FAILED']),
});

export const adminOverviewSchema: z.ZodType<AdminOverview> = z.object({
  registrationFee: feePolicySchema.nullable(),
  contract: contractSchema.nullable(),
  adminWallet: address.nullable(),
  walletHasAdminRole: z.boolean().nullable(),
  counts: z.object({
    DRAFT: z.number(),
    PENDING: z.number(),
    AUTHORIZED: z.number(),
    REJECTED: z.number(),
    DISABLED: z.number(),
  }),
});

export const adminOrganizationListSchema: z.ZodType<AdminOrganizationList> = z.object({
  items: z.array(organizationSummarySchema),
});

export const adminDecisionCallSchema: z.ZodType<AdminDecisionCall> = z.object({
  method: z.enum(['rejectOrganization', 'disableOrganization']),
  chainId: z.number().int().positive(),
  contractAddress: address,
  wallet: address,
  partyId: bytes32,
  reasonHash: bytes32,
});

/** Form đăng ký doanh nghiệp: cùng quy tắc với API để báo lỗi ngay trên trình duyệt. */
export const organizationFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Nhập tên doanh nghiệp')
    .max(ORGANIZATION_NAME_MAX_LENGTH, `Tên tối đa ${ORGANIZATION_NAME_MAX_LENGTH} ký tự`),
  taxCode: z
    .string()
    .trim()
    .regex(
      TAX_CODE_PATTERN,
      'Mã số thuế gồm 10 chữ số, chi nhánh thêm -xxx (ví dụ 0312345678-001)',
    ),
  orgType: orgType.catch('MANUFACTURER'),
  contactEmail: z
    .string()
    .trim()
    .max(EMAIL_MAX_LENGTH, `Email tối đa ${EMAIL_MAX_LENGTH} ký tự`)
    .pipe(z.email('Email không hợp lệ')),
  contactPhone: z
    .string()
    .transform((value) => value.replace(/[\s.()-]/g, ''))
    .refine((value) => value === '' || CONTACT_PHONE_PATTERN.test(value), {
      message: 'Số điện thoại gồm 8–15 chữ số',
    }),
  address: z
    .string()
    .trim()
    .max(
      ORGANIZATION_ADDRESS_MAX_LENGTH,
      `Địa chỉ tối đa ${ORGANIZATION_ADDRESS_MAX_LENGTH} ký tự`,
    ),
});

export type OrganizationFormValues = z.infer<typeof organizationFormSchema>;

export const reasonSchema = z
  .string()
  .trim()
  .min(1, 'Nhập lý do')
  .max(STATUS_REASON_MAX_LENGTH, `Lý do tối đa ${STATUS_REASON_MAX_LENGTH} ký tự`);
