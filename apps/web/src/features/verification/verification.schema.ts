import {
  AuthStatus,
  type OnchainSnapshot,
  ProductState,
  type PublicVerificationView,
  VERIFICATION_CHECKS,
  VERIFICATION_STATUSES,
  type VerificationContracts,
  WarrantyState,
} from '@dpp/shared';
import { z } from 'zod';
import { addressSchema, bytes32Schema, isoDateSchema } from '@/lib/chain-schema';
import { partyLabelSchema } from '../products/product.schema';

const onchainSchema: z.ZodType<OnchainSnapshot> = z.object({
  metadataHash: bytes32Schema.nullable(),
  issuerPartyId: bytes32Schema.nullable(),
  issuerStatus: z.enum(Object.values(AuthStatus)).nullable(),
  productState: z.enum(Object.values(ProductState)).nullable(),
  holder: partyLabelSchema.nullable(),
  pendingRetailer: z.object({ name: z.string(), partyId: bytes32Schema }).nullable(),
  hasOwner: z.boolean(),
  warrantyState: z.enum(Object.values(WarrantyState)).nullable(),
  warrantyExpiresAt: isoDateSchema.nullable(),
});

const contractsSchema: z.ZodType<VerificationContracts> = z.object({
  chainId: z.number().int().positive(),
  productPassport: addressSchema,
  partyRegistry: addressSchema,
  warrantyManager: addressSchema.nullable(),
  serviceTicketManager: addressSchema.nullable(),
  inspectionRegistry: addressSchema.nullable(),
  ownershipTransfer: addressSchema.nullable(),
  productLifecycle: addressSchema.nullable(),
});

/** `GET /public/products/:code/verification` (M11). */
export const publicVerificationSchema: z.ZodType<PublicVerificationView> = z.object({
  status: z.enum(VERIFICATION_STATUSES),
  checks: z.array(
    z.object({ key: z.enum(VERIFICATION_CHECKS), status: z.enum(VERIFICATION_STATUSES) }),
  ),
  onchain: onchainSchema.nullable(),
  atBlock: z.string().regex(/^\d+$/).nullable(),
  indexedAt: isoDateSchema.nullable(),
  checkedAt: isoDateSchema,
  contracts: contractsSchema.nullable(),
});
