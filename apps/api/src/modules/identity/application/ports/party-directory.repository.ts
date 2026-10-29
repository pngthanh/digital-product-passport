import type { TransactionScope } from '../../../../common/persistence/transaction-scope.js';

export interface UserSummary {
  userId: string;
  fullName: string;
  email: string;
}

/** Phần bảng users, parties mà module khác cần qua IdentityDirectory. */
export interface PartyDirectoryRepository {
  describeUsers(userIds: readonly string[]): Promise<UserSummary[]>;
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
