import { Inject, Injectable } from '@nestjs/common';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import {
  PARTY_DIRECTORY_REPOSITORY,
  type PartyDirectoryRepository,
  type UserSummary,
} from './ports/party-directory.repository.js';
import {
  PARTY_WALLET_REPOSITORY,
  type PartyWalletRepository,
} from './ports/party-wallet.repository.js';

/** Người dùng xét ở vai trò thực hiện giao dịch on-chain bằng ví cá nhân của mình. */
export interface PartyActor {
  userId: string;
  /** UUID dòng parties của người dùng. */
  partyId: string;
  /** partyId (bytes32) khi Party đã đăng ký on-chain; `null` nếu chưa liên kết ví. */
  chainPartyId: string | null;
  /** Ví PERSONAL đang ACTIVE (chữ thường). */
  activeWallet: string | null;
}

/** Public API của identity cho module khác: tra người dùng, ví đang dùng và tạo Party tổ chức. */
@Injectable()
export class IdentityDirectory {
  constructor(
    @Inject(PARTY_WALLET_REPOSITORY) private readonly wallets: PartyWalletRepository,
    @Inject(PARTY_DIRECTORY_REPOSITORY) private readonly directory: PartyDirectoryRepository,
  ) {}

  async actorOf(userId: string): Promise<PartyActor | null> {
    const identity = await this.wallets.findIdentity(userId);
    if (!identity) {
      return null;
    }
    const active = identity.wallets.find(
      (wallet) => wallet.walletRole === 'PERSONAL' && wallet.status === 'ACTIVE',
    );
    return {
      userId,
      partyId: identity.party.id,
      chainPartyId: identity.party.chainPartyId,
      activeWallet: active?.address ?? null,
    };
  }

  async describeUsers(userIds: readonly string[]): Promise<Map<string, UserSummary>> {
    const unique = [...new Set(userIds)];
    const users = await this.directory.describeUsers(unique);
    return new Map(users.map((user) => [user.userId, user]));
  }

  createOrganizationParty(organizationId: string, scope: TransactionScope): Promise<void> {
    return this.directory.createOrganizationParty(organizationId, scope);
  }
}

export type { UserSummary };
