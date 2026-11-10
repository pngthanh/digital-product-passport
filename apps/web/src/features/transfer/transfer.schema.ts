import {
  type MyTransfers,
  type OwnedProductTransfer,
  TransferState,
  type TransferParty,
  type TransferRecipientPreview,
  type TransferRequestAuthorization,
  type TransferRequestView,
} from '@dpp/shared';
import { z } from 'zod';
import {
  addressSchema as address,
  bytes32Schema as bytes32,
  isoDateSchema as isoDate,
} from '@/lib/chain-schema';
import { organizationLabelSchema } from '../products/product.schema';

const contractSchema = z.object({ chainId: z.number().int().positive(), address });

const partySchema: z.ZodType<TransferParty> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('PERSON'),
    fullName: z.string(),
    maskedEmail: z.string(),
    isYou: z.boolean(),
  }),
  z.object({
    kind: z.literal('ORGANIZATION'),
    organizationId: z.uuid(),
    name: z.string(),
    taxCode: z.string(),
    isYou: z.boolean(),
  }),
]);

/** Kiểm tra đúng hợp đồng dữ liệu của API trước khi hiển thị (không tin dữ liệu mạng). */
export const transferRequestViewSchema: z.ZodType<TransferRequestView> = z.object({
  id: z.uuid(),
  requestId: z.string().regex(/^\d+$/),
  state: z.enum(Object.values(TransferState)),
  expired: z.boolean(),
  direction: z.enum(['OUTGOING', 'INCOMING']),
  from: partySchema,
  to: partySchema,
  product: z.object({
    id: z.uuid(),
    publicCode: z.string(),
    serialNumber: z.string(),
    modelName: z.string(),
    chainProductId: bytes32,
    issuer: organizationLabelSchema,
  }),
  requestedAt: isoDate,
  expiresAt: isoDate,
  closedAt: isoDate.nullable(),
  createdTxHash: bytes32,
  closedTxHash: bytes32.nullable(),
});

export const ownedProductTransferSchema: z.ZodType<OwnedProductTransfer> = z.object({
  blockedReason: z.string().nullable(),
  contract: contractSchema.nullable(),
  wallet: address.nullable(),
  active: transferRequestViewSchema.nullable(),
  history: z.array(transferRequestViewSchema),
});

export const myTransfersSchema: z.ZodType<MyTransfers> = z.object({
  contract: contractSchema.nullable(),
  wallet: address.nullable(),
  items: z.array(transferRequestViewSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  counts: z.object({ INCOMING: z.number(), OUTGOING: z.number(), CLOSED: z.number() }),
});

export const recipientPreviewSchema: z.ZodType<TransferRecipientPreview> = z.object({
  partyId: bytes32,
  party: partySchema,
  needsWallet: z.boolean(),
});

export const transferAuthorizationSchema: z.ZodType<TransferRequestAuthorization> = z.object({
  method: z.literal('createTransferRequest'),
  chainId: z.number().int().positive(),
  contractAddress: address,
  wallet: address,
  productId: bytes32,
  fromPartyId: bytes32,
  toPartyId: bytes32,
  expiresAt: z.string().regex(/^\d+$/),
  deadline: z.string().regex(/^\d+$/),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
  recipient: partySchema,
});
