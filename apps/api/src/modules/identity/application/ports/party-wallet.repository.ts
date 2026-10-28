import type { CustodyType, PartyType, WalletRole, WalletStatus } from '@dpp/shared';
import type { TransactionScope } from '../../../../common/persistence/transaction-scope.js';
import type { UserAccount } from '../../domain/user-account.js';

export interface WalletRecord {
  id: string;
  partyId: string;
  /** Chữ thường. */
  address: string;
  custodyType: CustodyType;
  walletRole: WalletRole;
  status: WalletStatus;
  activatedAt: Date | null;
  revokedAt: Date | null;
  linkTxHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserParty {
  id: string;
  partyType: PartyType;
  chainPartyId: string | null;
}

export interface IdentityRecord {
  account: UserAccount;
  party: UserParty;
  /** Mới nhất trước. */
  wallets: WalletRecord[];
}

export interface PendingWalletInput {
  partyId: string;
  address: string;
  reusePendingId: string | null;
  discardPendingId: string | null;
}

export interface RegistrationProjection {
  partyId: string;
  chainPartyId: string;
  address: string;
  txHash: string;
  activatedAt: Date;
}

export interface RotationProjection {
  partyId: string;
  previousAddress: string;
  newAddress: string;
  txHash: string;
  rotatedAt: Date;
}

/** Kết quả chiếu event, dùng để ghi audit; `null` nếu không tìm thấy Party trong CSDL. */
export interface ProjectionResult {
  userId: string | null;
  walletId: string;
}

/** Bảng parties và party_wallets. */
export interface PartyWalletRepository {
  findIdentity(userId: string): Promise<IdentityRecord | null>;
  findByAddress(address: string): Promise<WalletRecord | null>;
  /**
   * Tạo mới hoặc làm mới dòng ví PENDING; bỏ dòng PENDING cũ trong cùng giao dịch.
   * Vi phạm UNIQUE(address) ném WalletAlreadyUsedError, vi phạm "1 PENDING / Party" ném WalletLinkInProgressError.
   */
  savePendingPersonalWallet(input: PendingWalletInput): Promise<WalletRecord>;
  attachLinkTransaction(walletId: string, txHash: string): Promise<WalletRecord>;
  listStalePending(updatedBefore: Date): Promise<WalletRecord[]>;
  deletePending(walletId: string): Promise<void>;
  applyRegistration(
    projection: RegistrationProjection,
    scope: TransactionScope,
  ): Promise<ProjectionResult | null>;
  applyRotation(
    projection: RotationProjection,
    scope: TransactionScope,
  ): Promise<ProjectionResult | null>;
}

export const PARTY_WALLET_REPOSITORY = Symbol('PARTY_WALLET_REPOSITORY');
