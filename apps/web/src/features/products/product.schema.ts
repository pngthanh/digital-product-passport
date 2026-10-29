import {
  AuthStatus,
  MANUFACTURED_ON_MIN,
  MODEL_NAME_MAX_LENGTH,
  type MyProductList,
  normalizeManufacturedOn,
  normalizeSerialNumber,
  OrgType,
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  type ProductDetail,
  type ProductProof,
  type ProductRegistrationAuthorization,
  ProductState,
  type ProductSummary,
  type PublicPassportView,
  PUBLIC_CODE_PATTERN,
  SERIAL_NUMBER_MAX_LENGTH,
  SERIAL_NUMBER_PATTERN,
  SyncStatus,
  todayInVietnam,
  WARRANTY_MONTHS_MAX,
} from '@dpp/shared';
import { z } from 'zod';
import {
  addressSchema as address,
  bytes32Schema as bytes32,
  chainEventSchema,
  isoDateSchema as isoDate,
} from '@/lib/chain-schema';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const publicCode = z.string().regex(PUBLIC_CODE_PATTERN);
const contractSchema = z.object({ chainId: z.number().int().positive(), address });

const productSummarySchema: z.ZodType<ProductSummary> = z.object({
  id: z.uuid(),
  publicCode,
  serialNumber: z.string(),
  modelName: z.string(),
  manufacturedOn: day,
  warrantyMonths: z.number().int(),
  productState: z.enum(Object.values(ProductState)).nullable(),
  syncStatus: z.enum(Object.values(SyncStatus)),
  chainProductId: bytes32,
  metadataHash: bytes32,
  createdTxHash: bytes32.nullable(),
  onchainCreatedAt: isoDate.nullable(),
  createdAt: isoDate,
});

const proofSchema: z.ZodType<ProductProof> = z.object({
  chainId: z.number().int().positive(),
  contractAddress: address,
  productId: bytes32,
  metadataHash: bytes32,
  metadataMatchesHash: z.boolean(),
  onchainMatches: z.boolean().nullable(),
  registrationTxHash: bytes32.nullable(),
  registeredAt: isoDate.nullable(),
});

/** Kiểm tra đúng hợp đồng dữ liệu của API trước khi hiển thị (không tin dữ liệu mạng). */
export const myProductListSchema: z.ZodType<MyProductList> = z.object({
  manufacturer: z
    .object({
      organizationId: z.uuid(),
      name: z.string(),
      partyId: bytes32,
      authStatus: z.enum(Object.values(AuthStatus)),
      orgType: z.enum(Object.values(OrgType)),
    })
    .nullable(),
  contract: contractSchema.nullable(),
  items: z.array(productSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  counts: z.object({ ALL: z.number(), REGISTERED: z.number(), DRAFT: z.number() }),
});

export const productDetailSchema: z.ZodType<ProductDetail> = z.object({
  id: z.uuid(),
  publicCode,
  serialNumber: z.string(),
  modelName: z.string(),
  manufacturedOn: day,
  warrantyMonths: z.number().int(),
  productState: z.enum(Object.values(ProductState)).nullable(),
  syncStatus: z.enum(Object.values(SyncStatus)),
  chainProductId: bytes32,
  metadataHash: bytes32,
  createdTxHash: bytes32.nullable(),
  onchainCreatedAt: isoDate.nullable(),
  createdAt: isoDate,
  description: z.string().nullable(),
  issuer: z.object({ organizationId: z.uuid(), name: z.string(), partyId: bytes32 }),
  proof: proofSchema.nullable(),
  history: z.array(chainEventSchema),
});

export const publicPassportSchema: z.ZodType<PublicPassportView> = z.object({
  publicCode,
  serialNumber: z.string(),
  modelName: z.string(),
  description: z.string().nullable(),
  manufacturedOn: day,
  warrantyMonths: z.number().int(),
  productState: z.enum(Object.values(ProductState)),
  issuer: z.object({
    name: z.string(),
    taxCode: z.string(),
    orgType: z.enum(Object.values(OrgType)),
    authStatus: z.enum(Object.values(AuthStatus)),
    partyId: bytes32,
  }),
  custodian: z.object({ name: z.string() }).nullable(),
  proof: proofSchema,
  history: z.array(chainEventSchema),
});

export const registrationAuthorizationSchema: z.ZodType<ProductRegistrationAuthorization> =
  z.object({
    method: z.literal('registerProducts'),
    chainId: z.number().int().positive(),
    contractAddress: address,
    wallet: address,
    issuerId: bytes32,
    productIds: z.array(bytes32),
    metadataHashes: z.array(bytes32),
    deadline: z.string().regex(/^\d+$/),
    signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
    products: z.array(z.object({ id: z.uuid(), serialNumber: z.string(), publicCode })),
  });

/**
 * Một sản phẩm trên form hoặc một dòng CSV: cùng quy tắc với API để báo lỗi ngay trên trình duyệt.
 * Nhận chuỗi (giá trị form, ô CSV) và trả về dữ liệu đúng kiểu để gửi API.
 */
export const productFormSchema = z.object({
  serialNumber: z
    .string()
    .transform(normalizeSerialNumber)
    .pipe(
      z
        .string()
        .min(1, 'Nhập serial')
        .max(SERIAL_NUMBER_MAX_LENGTH, `Serial tối đa ${SERIAL_NUMBER_MAX_LENGTH} ký tự`)
        .regex(SERIAL_NUMBER_PATTERN, 'Serial chỉ gồm chữ, số và . _ / - (không có khoảng trắng)'),
    ),
  modelName: z
    .string()
    .trim()
    .min(1, 'Nhập tên model')
    .max(MODEL_NAME_MAX_LENGTH, `Tên model tối đa ${MODEL_NAME_MAX_LENGTH} ký tự`),
  description: z
    .string()
    .trim()
    .max(PRODUCT_DESCRIPTION_MAX_LENGTH, `Mô tả tối đa ${PRODUCT_DESCRIPTION_MAX_LENGTH} ký tự`)
    .transform((value) => value || null),
  manufacturedOn: z
    .string()
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
    .string()
    .trim()
    .regex(/^\d{1,3}$/, 'Số tháng bảo hành là số nguyên không âm')
    .transform(Number)
    .refine(
      (months) => months <= WARRANTY_MONTHS_MAX,
      `Bảo hành tối đa ${WARRANTY_MONTHS_MAX} tháng`,
    ),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;
export type ProductField = keyof z.input<typeof productFormSchema>;
