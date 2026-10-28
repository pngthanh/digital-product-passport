import type {
  IdentitySnapshot,
  WalletLinkAuthorization,
  WalletLinkChallenge,
  WalletSummary,
} from '@dpp/shared';
import { z } from 'zod';

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const isoDate = z.iso.datetime({ offset: true });

/** Kiểm tra đúng hợp đồng dữ liệu của API trước khi hiển thị (không tin dữ liệu mạng). */
export const walletSummarySchema: z.ZodType<WalletSummary> = z.object({
  id: z.uuid(),
  address,
  custodyType: z.enum(['CUSTODIAL', 'NON_CUSTODIAL']),
  walletRole: z.enum(['OWNER', 'OPERATIONAL', 'PERSONAL']),
  status: z.enum(['PENDING', 'ACTIVE', 'ROTATED', 'REVOKED']),
  activatedAt: isoDate.nullable(),
  revokedAt: isoDate.nullable(),
  linkTxHash: bytes32.nullable(),
  createdAt: isoDate,
});

export const identitySnapshotSchema: z.ZodType<IdentitySnapshot> = z.object({
  account: z.object({
    id: z.uuid(),
    email: z.string(),
    fullName: z.string(),
    systemRole: z.enum(['ADMIN', 'USER']),
    createdAt: isoDate,
  }),
  party: z.object({
    id: z.uuid(),
    partyType: z.enum(['USER', 'ORGANIZATION']),
    partyId: bytes32,
    registeredOnChain: z.boolean(),
  }),
  wallets: z.array(walletSummarySchema),
});

export const walletLinkChallengeSchema: z.ZodType<WalletLinkChallenge> = z.object({
  purpose: z.enum(['LINK', 'ROTATE']),
  address,
  message: z.string().min(1),
  challengeToken: z.string().min(1),
  expiresAt: isoDate,
});

export const walletLinkAuthorizationSchema: z.ZodType<WalletLinkAuthorization> = z.object({
  walletId: z.uuid(),
  method: z.enum(['registerUser', 'rotateWallet']),
  chainId: z.number().int().positive(),
  contractAddress: address,
  partyId: bytes32,
  wallet: address,
  previousWallet: address,
  deadline: z.string().regex(/^\d+$/),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});
