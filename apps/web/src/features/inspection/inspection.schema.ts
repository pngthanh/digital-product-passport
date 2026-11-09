import {
  InspectionRequestState,
  InspectionResult,
  ProductState,
  SyncStatus,
  type InspectionDetail,
  type InspectionItem,
  type InspectionRecordAuthorization,
  type InspectionReportView,
  type InspectionRequestView,
  type MyInspections,
  type ProductInspection,
  type PublicInspectionView,
  type PublicProductInspections,
} from '@dpp/shared';
import { z } from 'zod';
import {
  addressSchema as address,
  bytes32Schema as bytes32,
  chainEventSchema,
  isoDateSchema as isoDate,
} from '@/lib/chain-schema';
import { evidenceFileTypeSchema } from '@/lib/evidence-file';
import { organizationInfoSchema, organizationLabelSchema } from '../products/product.schema';

const contractSchema = z.object({ chainId: z.number().int().positive(), address });
const resultSchema = z.enum(Object.values(InspectionResult));
const requesterRoleSchema = z.enum(['MANUFACTURER', 'OWNER']);

const reportSchema: z.ZodType<InspectionReportView> = z.object({
  result: resultSchema,
  summary: z.string(),
  reportHash: bytes32,
  fileType: evidenceFileTypeSchema.nullable(),
  inspectedAt: isoDate.nullable(),
  txHash: bytes32.nullable(),
  syncStatus: z.enum(Object.values(SyncStatus)),
  matchesOnchain: z.boolean().nullable(),
});

const requestShape = {
  id: z.uuid(),
  inspectionId: bytes32,
  state: z.enum(Object.values(InspectionRequestState)),
  requesterRole: requesterRoleSchema,
  note: z.string(),
  inspector: organizationLabelSchema,
  requestedAt: isoDate,
  closedAt: isoDate.nullable(),
  declineReason: z.string().nullable(),
  report: reportSchema.nullable(),
};

export const inspectionRequestViewSchema: z.ZodType<InspectionRequestView> = z.object(requestShape);

/** Kiểm tra đúng hợp đồng dữ liệu của API trước khi hiển thị (không tin dữ liệu mạng). */
export const productInspectionSchema: z.ZodType<ProductInspection> = z.object({
  blockedReason: z.string().nullable(),
  inspectors: z.array(
    z.object({
      organizationId: z.uuid(),
      name: z.string(),
      address: z.string().nullable(),
      partyId: bytes32,
    }),
  ),
  requests: z.array(inspectionRequestViewSchema),
});

const itemShape = {
  ...requestShape,
  product: z.object({
    id: z.uuid(),
    publicCode: z.string(),
    serialNumber: z.string(),
    modelName: z.string(),
    chainProductId: bytes32,
    productState: z.enum(Object.values(ProductState)),
    issuer: organizationLabelSchema,
  }),
};

const inspectionItemSchema: z.ZodType<InspectionItem> = z.object(itemShape);

export const myInspectionsSchema: z.ZodType<MyInspections> = z.object({
  inspector: organizationInfoSchema.nullable(),
  contract: contractSchema.nullable(),
  items: z.array(inspectionItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  counts: z.object({ REQUESTED: z.number(), COMPLETED: z.number(), CLOSED: z.number() }),
});

export const inspectionDetailSchema: z.ZodType<InspectionDetail> = z.object({
  ...itemShape,
  requester: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('MANUFACTURER'), name: z.string() }),
    z.object({ kind: z.literal('OWNER'), fullName: z.string(), maskedEmail: z.string() }),
  ]),
  contract: contractSchema.nullable(),
  history: z.array(chainEventSchema),
});

export const recordAuthorizationSchema: z.ZodType<InspectionRecordAuthorization> = z.object({
  method: z.literal('recordInspection'),
  chainId: z.number().int().positive(),
  contractAddress: address,
  wallet: address,
  inspectionId: bytes32,
  productId: bytes32,
  inspectorId: bytes32,
  requesterId: bytes32,
  result: resultSchema,
  resultCode: z.number().int().min(1).max(3),
  reportHash: bytes32,
  deadline: z.string().regex(/^\d+$/),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

const publicInspectionSchema: z.ZodType<PublicInspectionView> = z.object({
  id: z.uuid(),
  inspectionId: bytes32,
  inspector: organizationLabelSchema,
  requesterRole: requesterRoleSchema,
  result: resultSchema,
  summary: z.string(),
  fileType: evidenceFileTypeSchema.nullable(),
  reportHash: bytes32,
  inspectedAt: isoDate,
  txHash: bytes32,
  matchesOnchain: z.boolean(),
});

export const publicInspectionsSchema: z.ZodType<PublicProductInspections> = z.object({
  items: z.array(publicInspectionSchema),
});
