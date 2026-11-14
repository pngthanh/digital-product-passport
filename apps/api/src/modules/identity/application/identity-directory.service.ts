import { Inject, Injectable } from '@nestjs/common';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import { normalizeEmail } from '../domain/email.js';
import {
  PARTY_DIRECTORY_REPOSITORY,
  type PartyDirectoryRepository,
  type PartySummary,
  type PersonSummary,
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

  /** Tài khoản cá nhân theo email (không phân biệt hoa thường). */
  findPersonByEmail(email: string): Promise<PersonSummary | null> {
    return this.directory.findPersonByEmail(normalizeEmail(email));
  }

  /** Loại của các Party (UUID); Party không tồn tại thì không có trong kết quả. */
  async describeParties(partyIds: readonly string[]): Promise<Map<string, PartySummary>> {
    const parties = await this.directory.describeParties([...new Set(partyIds)]);
    return new Map(parties.map((party) => [party.partyId, party]));
  }

  /**
   * (M11) Người dùng sở hữu từng ví (kể cả ví đã xoay hay đã gỡ), theo địa chỉ chữ thường; ví lạ
   * hoặc không thuộc Party cá nhân thì không có trong kết quả.
   */
  async usersOfWallets(addresses: readonly string[]): Promise<Map<string, string>> {
    const unique = [...new Set(addresses.map((address) => address.toLowerCase()))];
    const wallets = (
      await Promise.all(unique.map((address) => this.wallets.findByAddress(address)))
    ).filter((wallet) => wallet !== null);
    const parties = await this.describeParties(wallets.map((wallet) => wallet.partyId));
    const users = new Map<string, string>();
    for (const wallet of wallets) {
      const userId = parties.get(wallet.partyId)?.userId;
      if (userId) {
        users.set(wallet.address, userId);
      }
    }
    return users;
  }

  /** (M12) Party sở hữu ví (kể cả ví cũ); `null` khi ví lạ. */
  async partyOfWallet(address: string): Promise<string | null> {
    return (await this.wallets.findByAddress(address.toLowerCase()))?.partyId ?? null;
  }

  createOrganizationParty(organizationId: string, scope: TransactionScope): Promise<void> {
    return this.directory.createOrganizationParty(organizationId, scope);
  }
}

export type { PartySummary, PersonSummary, UserSummary };
