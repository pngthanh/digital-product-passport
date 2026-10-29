import type { TransactionScope } from '../../../../common/persistence/transaction-scope.js';

export interface UserSummary {
  userId: string;
  fullName: string;
  email: string;
}

/** Người dùng cá nhân kèm Party của họ (người mua ở DST-03). */
export interface PersonSummary extends UserSummary {
  /** UUID dòng parties (USER). */
  partyId: string;
}

/** Loại Party; `userId` chỉ có với Party cá nhân. */
export interface PartySummary {
  partyId: string;
  kind: 'USER' | 'ORGANIZATION';
  userId: string | null;
}

/** Phần bảng users, parties mà module khác cần qua IdentityDirectory. */
export interface PartyDirectoryRepository {
  describeUsers(userIds: readonly string[]): Promise<UserSummary[]>;
  /** `email` đã chuẩn hoá; `null` nếu không có tài khoản. */
  findPersonByEmail(email: string): Promise<PersonSummary | null>;
  describeParties(partyIds: readonly string[]): Promise<PartySummary[]>;
  /** Party của tổ chức dùng chung UUID với dòng organizations, nên partyId on-chain suy ra từ id tổ chức. */
  createOrganizationParty(organizationId: string, scope: TransactionScope): Promise<void>;
  /** Ghi chain_party_id cho Party tổ chức khi event PartyRegistered finalized; `false` nếu không có Party. */
  markOrganizationRegistered(
    partyId: string,
    chainPartyId: string,
    scope: TransactionScope,
  ): Promise<boolean>;
}

export const PARTY_DIRECTORY_REPOSITORY = Symbol('PARTY_DIRECTORY_REPOSITORY');
