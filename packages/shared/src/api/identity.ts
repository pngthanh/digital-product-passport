/*
 * Hợp đồng dữ liệu của module Identity & Auth (M2), dùng chung cho API và Web.
 */

import type { PartyRegistryMethod } from '../chain/party-registry.js';
import type {
  CustodyType,
  PartyType,
  SystemRole,
  WalletRole,
  WalletStatus,
} from '../domain/enums.js';

export interface AccountProfile {
  id: string;
  email: string;
  fullName: string;
  systemRole: SystemRole;
  createdAt: string;
}

export interface PartySummary {
  id: string;
  partyType: PartyType;
  /** partyId (bytes32) mà contract dùng; luôn suy ra được từ `id`. */
  partyId: string;
  /** `true` khi Indexer đã thấy event PartyRegistered đã finalized. */
  registeredOnChain: boolean;
}

export interface WalletSummary {
  id: string;
  /** Dạng checksum EIP-55 để hiển thị. */
  address: string;
  custodyType: CustodyType;
  walletRole: WalletRole;
  status: WalletStatus;
  activatedAt: string | null;
  revokedAt: string | null;
  linkTxHash: string | null;
  createdAt: string;
}

/** Trả về bởi `GET /auth/me`: tài khoản, Party và lịch sử ví (mới nhất trước). */
export interface IdentitySnapshot {
  account: AccountProfile;
  party: PartySummary;
  wallets: WalletSummary[];
}

export type WalletLinkPurpose = 'LINK' | 'ROTATE';

/** Thông điệp EIP-4361 để ví ký, kèm token ràng buộc phiên yêu cầu. */
export interface WalletLinkChallenge {
  purpose: WalletLinkPurpose;
  address: string;
  message: string;
  challengeToken: string;
  expiresAt: string;
}

/** Giấy phép EIP-712 do backend ký; ví `wallet` tự gửi giao dịch `method` lên contract. */
export interface WalletLinkAuthorization {
  walletId: string;
  method: PartyRegistryMethod;
  chainId: number;
  contractAddress: string;
  partyId: string;
  wallet: string;
  previousWallet: string;
  /** Giây Unix, dạng chuỗi thập phân để không mất chính xác khi qua JSON. */
  deadline: string;
  signature: string;
}

/** Định dạng lỗi chung của API. `code` có khi lỗi thuộc nghiệp vụ. */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  code?: string;
  details?: unknown;
  path: string;
  requestId: string | null;
  timestamp: string;
}
