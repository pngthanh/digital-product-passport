import {
  AuthStatus,
  type InventoryDetail,
  type InventoryItem,
  JOURNEY_STEP_KINDS,
  type JourneyStep,
  MANUFACTURED_ON_MIN,
  MODEL_NAME_MAX_LENGTH,
  type MyInventory,
  type MyProductList,
  type MyWorkspace,
  normalizeManufacturedOn,
  normalizeSerialNumber,
  type OrganizationLabel,
  OrgType,
  type OwnedProduct,
  type OwnedProductDetail,
  type PartyLabel,
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  type ProductDetail,
  type ProductProof,
  type ProductRegistrationAuthorization,
  type ProductSaleAuthorization,
  ProductState,
  type ProductSummary,
  type PublicPassportView,
  PUBLIC_CODE_PATTERN,
  type RetailerOption,
  SERIAL_NUMBER_MAX_LENGTH,
  SERIAL_NUMBER_PATTERN,
  SyncStatus,
  todayInVietnam,
  WARRANTY_MONTHS_MAX,
  WarrantyState,
  type WarrantyView,
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

const organizationLabelSchema: z.ZodType<OrganizationLabel> = z.object({
  organizationId: z.uuid(),
  name: z.string(),
  partyId: bytes32,
});

const partyLabelSchema: z.ZodType<PartyLabel> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ORGANIZATION'), organization: organizationLabelSchema }),
  z.object({ kind: z.literal('PERSON'), isYou: z.boolean() }),
]);

const summaryShape = {
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
  holder: partyLabelSchema.nullable(),
  pendingRetailer: organizationLabelSchema.nullable(),
};

const productSummarySchema: z.ZodType<ProductSummary> = z.object(summaryShape);

const warrantySchema: z.ZodType<WarrantyView> = z.object({
  state: z.enum(Object.values(WarrantyState)),
  months: z.number().int(),
  activatedAt: isoDate,
  expiresAt: isoDate,
  activatedBy: organizationLabelSchema.nullable(),
  activationTxHash: bytes32,
});

const journeyStepSchema: z.ZodType<JourneyStep> = z.object({
  kind: z.enum(JOURNEY_STEP_KINDS),
  at: isoDate,
  txHash: bytes32,
  from: partyLabelSchema.nullable(),
  to: partyLabelSchema.nullable(),
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

const detailShape = {
  ...summaryShape,
  description: z.string().nullable(),
  issuer: organizationLabelSchema,
  proof: proofSchema.nullable(),
  warranty: warrantySchema.nullable(),
  journey: z.array(journeyStepSchema),
  history: z.array(chainEventSchema),
};

export const productDetailSchema: z.ZodType<ProductDetail> = z.object(detailShape);

const organizationInfoSchema = z.object({
  organizationId: z.uuid(),
  name: z.string(),
  partyId: bytes32,
  authStatus: z.enum(Object.values(AuthStatus)),
  orgType: z.enum(Object.values(OrgType)),
});

export const retailerOptionsSchema: z.ZodType<RetailerOption[]> = z.array(
  z.object({
    organizationId: z.uuid(),
    name: z.string(),
    taxCode: z.string(),
    address: z.string().nullable(),
    partyId: bytes32,
  }),
);

const inventoryItemSchema: z.ZodType<InventoryItem> = z.object({
  ...summaryShape,
  issuer: organizationLabelSchema,
  soldAt: isoDate.nullable(),
});

export const myInventorySchema: z.ZodType<MyInventory> = z.object({
  retailer: organizationInfoSchema.nullable(),
  contract: contractSchema.nullable(),
  items: z.array(inventoryItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  counts: z.object({ INCOMING: z.number(), IN_STOCK: z.number(), SOLD: z.number() }),
});

export const inventoryDetailSchema: z.ZodType<InventoryDetail> = z.object({
  ...detailShape,
  soldAt: isoDate.nullable(),
});

const ownedShape = {
  ...summaryShape,
  issuer: organizationLabelSchema,
  warranty: warrantySchema.nullable(),
  acquiredAt: isoDate,
};

export const ownedProductsSchema: z.ZodType<OwnedProduct[]> = z.array(z.object(ownedShape));

export const ownedProductDetailSchema: z.ZodType<OwnedProductDetail> = z.object({
  ...ownedShape,
  description: z.string().nullable(),
  proof: proofSchema.nullable(),
  journey: z.array(journeyStepSchema),
  history: z.array(chainEventSchema),
});

export const workspaceSchema: z.ZodType<MyWorkspace> = z.object({
  organization: z
    .object({
      organizationId: z.uuid(),
      name: z.string(),
      orgType: z.enum(Object.values(OrgType)),
      authStatus: z.enum(Object.values(AuthStatus)),
    })
    .nullable(),
  ownedProducts: z.number().int().nonnegative(),
});

export const saleAuthorizationSchema: z.ZodType<ProductSaleAuthorization> = z.object({
  method: z.literal('sellAndActivateWarranty'),
  chainId: z.number().int().positive(),
  contractAddress: address,
  wallet: address,
  productId: bytes32,
  retailerId: bytes32,
  buyerId: bytes32,
  deadline: z.string().regex(/^\d+$/),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
  buyer: z.object({ fullName: z.string(), maskedEmail: z.string() }),
  warrantyMonths: z.number().int(),
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
  holder: partyLabelSchema.nullable(),
  pendingRetailer: z.object({ name: z.string() }).nullable(),
  hasOwner: z.boolean(),
  warranty: warrantySchema.nullable(),
  proof: proofSchema,
  journey: z.array(journeyStepSchema),
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
    warrantyMonths: z.array(z.number().int().nonnegative()),
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
