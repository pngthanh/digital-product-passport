import {
  type MyServiceTickets,
  type OwnedProductService,
  SERVICE_ACTION_CODES,
  type ServiceRecordView,
  type ServiceRequestView,
  ServiceState,
  type ServiceTicketClosing,
  type ServiceTicketDetail,
  type ServiceTicketItem,
  type ServiceTicketOpeningAuthorization,
  SyncStatus,
  WarrantyState,
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

const recordSchema: z.ZodType<ServiceRecordView> = z.object({
  actionCode: z.enum(SERVICE_ACTION_CODES),
  actionDetail: z.string().nullable(),
  evidenceHash: bytes32,
  fileType: evidenceFileTypeSchema.nullable(),
  recordedAt: isoDate.nullable(),
  txHash: bytes32.nullable(),
  syncStatus: z.enum(Object.values(SyncStatus)),
  matchesOnchain: z.boolean().nullable(),
});

const requestShape = {
  id: z.uuid(),
  ticketId: bytes32,
  state: z.enum(Object.values(ServiceState)),
  issueDesc: z.string(),
  serviceCenter: organizationLabelSchema,
  requestedAt: isoDate,
  cancelledAt: isoDate.nullable(),
  warrantyCovered: z.boolean().nullable(),
  openedAt: isoDate.nullable(),
  closedAt: isoDate.nullable(),
  openTxHash: bytes32.nullable(),
  closeTxHash: bytes32.nullable(),
  record: recordSchema.nullable(),
};

export const serviceRequestViewSchema: z.ZodType<ServiceRequestView> = z.object(requestShape);

/** Kiểm tra đúng hợp đồng dữ liệu của API trước khi hiển thị (không tin dữ liệu mạng). */
export const ownedProductServiceSchema: z.ZodType<OwnedProductService> = z.object({
  blockedReason: z.string().nullable(),
  centers: z.array(
    z.object({
      organizationId: z.uuid(),
      name: z.string(),
      address: z.string().nullable(),
      partyId: bytes32,
    }),
  ),
  requests: z.array(serviceRequestViewSchema),
});

const itemShape = {
  ...requestShape,
  product: z.object({
    id: z.uuid(),
    publicCode: z.string(),
    serialNumber: z.string(),
    modelName: z.string(),
    chainProductId: bytes32,
    issuer: organizationLabelSchema,
  }),
};

const ticketItemSchema: z.ZodType<ServiceTicketItem> = z.object(itemShape);

export const myServiceTicketsSchema: z.ZodType<MyServiceTickets> = z.object({
  serviceCenter: organizationInfoSchema.nullable(),
  contract: contractSchema.nullable(),
  items: z.array(ticketItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  counts: z.object({ REQUESTED: z.number(), IN_REPAIR: z.number(), CLOSED: z.number() }),
});

export const serviceTicketDetailSchema: z.ZodType<ServiceTicketDetail> = z.object({
  ...itemShape,
  requester: z.object({ fullName: z.string(), maskedEmail: z.string() }),
  warranty: z
    .object({ state: z.enum(Object.values(WarrantyState)), expiresAt: isoDate })
    .nullable(),
  contract: contractSchema.nullable(),
  history: z.array(chainEventSchema),
});

export const openingAuthorizationSchema: z.ZodType<ServiceTicketOpeningAuthorization> = z.object({
  method: z.literal('openTicket'),
  chainId: z.number().int().positive(),
  contractAddress: address,
  wallet: address,
  ticketId: bytes32,
  productId: bytes32,
  serviceCenterId: bytes32,
  requesterId: bytes32,
  deadline: z.string().regex(/^\d+$/),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

export const ticketClosingSchema: z.ZodType<ServiceTicketClosing> = z.object({
  method: z.literal('closeTicket'),
  chainId: z.number().int().positive(),
  contractAddress: address,
  wallet: address,
  ticketId: bytes32,
  repaired: z.boolean(),
  evidenceHash: bytes32,
});
