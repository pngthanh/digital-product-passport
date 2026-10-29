import { randomUUID } from 'node:crypto';
import type { TransactionScope } from '../../src/common/persistence/transaction-scope.js';
import { AuditTrail } from '../../src/modules/audit/application/audit-trail.service.js';
import type { AuditEntry } from '../../src/modules/audit/domain/audit-entry.js';
import type { TrackedTxStatus, TrackTransactionInput } from '../../src/modules/chain-sync/index.js';
import type {
  AccountRepository,
  NewAccount,
} from '../../src/modules/identity/application/ports/account.repository.js';
import type { PasswordHasher } from '../../src/modules/identity/application/ports/password-hasher.port.js';
import type { PartyRegistryReader } from '../../src/modules/identity/application/ports/party-registry-reader.port.js';
import type {
  IdentityRecord,
  PartyWalletRepository,
  PendingWalletInput,
  ProjectionResult,
  RegisteredParty,
  RegistrationProjection,
  RotationProjection,
  WalletRecord,
} from '../../src/modules/identity/application/ports/party-wallet.repository.js';
import type {
  IssuedSession,
  SessionClaims,
  SessionTokens,
} from '../../src/modules/identity/application/ports/session-tokens.port.js';
import type {
  WalletChallengeClaims,
  WalletChallengeTokens,
} from '../../src/modules/identity/application/ports/wallet-challenge-tokens.port.js';
import {
  EmailAlreadyRegisteredError,
  WalletAlreadyUsedError,
} from '../../src/modules/identity/domain/identity.errors.js';
import type { UserAccount } from '../../src/modules/identity/domain/user-account.js';

/** Băm giả: đủ để kiểm tra luồng nghiệp vụ mà không tốn thời gian chạy Argon2id. */
export class FakePasswordHasher implements PasswordHasher {
  dummyVerifications = 0;

  async hash(password: string): Promise<string> {
    return `$argon2id$fake$${password}`;
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    return passwordHash === `$argon2id$fake$${password}`;
  }

  async verifyDummy(): Promise<void> {
    this.dummyVerifications += 1;
  }
}

export class FakeSessionTokens implements SessionTokens {
  async issue(claims: SessionClaims): Promise<IssuedSession> {
    return {
      token: `session.${claims.userId}.${claims.sessionVersion}`,
      expiresAt: new Date('2026-10-28T20:00:00Z'),
    };
  }

  async verify(token: string): Promise<SessionClaims | null> {
    const [kind, userId, version] = token.split('.');
    return kind === 'session' && userId && version
      ? { userId, sessionVersion: Number(version) }
      : null;
  }
}

export class FakeChallengeTokens implements WalletChallengeTokens {
  private readonly issued = new Map<string, WalletChallengeClaims>();

  async issue(claims: WalletChallengeClaims): Promise<string> {
    const token = `challenge-${this.issued.size + 1}`;
    this.issued.set(token, claims);
    return token;
  }

  async verify(token: string): Promise<WalletChallengeClaims | null> {
    return this.issued.get(token) ?? null;
  }
}

export class RecordingAuditWriter {
  readonly entries: AuditEntry[] = [];

  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }

  actions(): string[] {
    return this.entries.map((entry) => entry.action);
  }
}

export function recordingAudit(): { audit: AuditTrail; writer: RecordingAuditWriter } {
  const writer = new RecordingAuditWriter();
  return { audit: new AuditTrail(writer), writer };
}

interface StoredParty {
  id: string;
  userId: string;
  chainPartyId: string | null;
}

/** Bộ nhớ thay cho bảng users, parties, party_wallets; giữ các ràng buộc UNIQUE quan trọng. */
export class InMemoryIdentityStore implements AccountRepository, PartyWalletRepository {
  readonly accounts = new Map<string, UserAccount>();
  readonly parties = new Map<string, StoredParty>();
  readonly wallets = new Map<string, WalletRecord>();

  async findByEmail(email: string): Promise<UserAccount | null> {
    return [...this.accounts.values()].find((account) => account.email === email) ?? null;
  }

  async findById(userId: string): Promise<UserAccount | null> {
    return this.accounts.get(userId) ?? null;
  }

  async createWithParty(input: NewAccount): Promise<{ account: UserAccount; partyId: string }> {
    if (await this.findByEmail(input.email)) {
      throw new EmailAlreadyRegisteredError();
    }
    const account: UserAccount = {
      ...input,
      id: randomUUID(),
      systemRole: 'USER',
      status: 'ACTIVE',
      sessionVersion: 0,
      createdAt: new Date('2026-10-28T08:00:00Z'),
    };
    const party: StoredParty = { id: randomUUID(), userId: account.id, chainPartyId: null };
    this.accounts.set(account.id, account);
    this.parties.set(party.id, party);
    return { account, partyId: party.id };
  }

  async incrementSessionVersion(userId: string): Promise<void> {
    const account = this.accounts.get(userId);
    if (account) {
      this.accounts.set(userId, { ...account, sessionVersion: account.sessionVersion + 1 });
    }
  }

  partyOfUser(userId: string): StoredParty {
    const party = [...this.parties.values()].find((candidate) => candidate.userId === userId);
    if (!party) {
      throw new Error(`Không có Party cho user ${userId}`);
    }
    return party;
  }

  async findIdentity(userId: string): Promise<IdentityRecord | null> {
    const account = this.accounts.get(userId);
    if (!account) {
      return null;
    }
    const party = this.partyOfUser(userId);
    return {
      account,
      party: { id: party.id, partyType: 'USER', chainPartyId: party.chainPartyId },
      wallets: [...this.wallets.values()]
        .filter((wallet) => wallet.partyId === party.id)
        .toReversed(),
    };
  }

  async findByAddress(address: string): Promise<WalletRecord | null> {
    return [...this.wallets.values()].find((wallet) => wallet.address === address) ?? null;
  }

  async savePendingPersonalWallet(input: PendingWalletInput): Promise<WalletRecord> {
    if (input.discardPendingId) {
      this.wallets.delete(input.discardPendingId);
    }
    if (input.reusePendingId) {
      const reused = this.requireWallet(input.reusePendingId);
      return this.put({ ...reused, linkTxHash: null });
    }
    if (await this.findByAddress(input.address)) {
      throw new WalletAlreadyUsedError();
    }
    return this.put(this.newWallet(input.partyId, input.address, 'PENDING'));
  }

  async attachLinkTransaction(walletId: string, txHash: string): Promise<WalletRecord> {
    return this.put({ ...this.requireWallet(walletId), linkTxHash: txHash });
  }

  async listStalePending(updatedBefore: Date): Promise<WalletRecord[]> {
    return [...this.wallets.values()].filter(
      (wallet) => wallet.status === 'PENDING' && wallet.updatedAt < updatedBefore,
    );
  }

  async deletePending(walletId: string): Promise<void> {
    this.wallets.delete(walletId);
  }

  async listRegisteredParties(
    afterPartyId: string | null,
    limit: number,
  ): Promise<RegisteredParty[]> {
    return [...this.parties.values()]
      .filter((party) => party.chainPartyId !== null && (!afterPartyId || party.id > afterPartyId))
      .toSorted((a, b) => (a.id < b.id ? -1 : 1))
      .slice(0, limit)
      .map((party) => ({
        partyId: party.id,
        chainPartyId: party.chainPartyId ?? '',
        activeWallet:
          [...this.wallets.values()].find(
            (wallet) => wallet.partyId === party.id && wallet.status === 'ACTIVE',
          )?.address ?? null,
      }));
  }

  async applyRegistration(
    projection: RegistrationProjection,
    _scope: TransactionScope,
  ): Promise<ProjectionResult | null> {
    const party = this.parties.get(projection.partyId);
    if (!party) {
      return null;
    }
    party.chainPartyId ??= projection.chainPartyId;
    const wallet = this.activate(
      party.id,
      projection.address,
      projection.txHash,
      projection.activatedAt,
    );
    return { userId: party.userId, walletId: wallet.id };
  }

  async applyRotation(
    projection: RotationProjection,
    _scope: TransactionScope,
  ): Promise<ProjectionResult | null> {
    const party = this.parties.get(projection.partyId);
    if (!party) {
      return null;
    }
    const previous = [...this.wallets.values()].find(
      (wallet) => wallet.address === projection.previousAddress && wallet.status === 'ACTIVE',
    );
    if (previous) {
      this.put({ ...previous, status: 'ROTATED', revokedAt: projection.rotatedAt });
    }
    const wallet = this.activate(
      party.id,
      projection.newAddress,
      projection.txHash,
      projection.rotatedAt,
    );
    return { userId: party.userId, walletId: wallet.id };
  }

  /** Tạo sẵn một ví cho Party của người dùng (dữ liệu nền cho test). */
  seedWallet(userId: string, address: string, status: WalletRecord['status']): WalletRecord {
    return this.put(this.newWallet(this.partyOfUser(userId).id, address, status));
  }

  private activate(partyId: string, address: string, txHash: string, at: Date): WalletRecord {
    const existing = [...this.wallets.values()].find((wallet) => wallet.address === address);
    const base = existing ?? this.newWallet(partyId, address, 'PENDING');
    return this.put({ ...base, status: 'ACTIVE', activatedAt: at, linkTxHash: txHash });
  }

  private newWallet(
    partyId: string,
    address: string,
    status: WalletRecord['status'],
  ): WalletRecord {
    const now = new Date('2026-10-28T08:00:00Z');
    return {
      id: randomUUID(),
      partyId,
      address,
      custodyType: 'NON_CUSTODIAL',
      walletRole: 'PERSONAL',
      status,
      activatedAt: status === 'PENDING' ? null : now,
      revokedAt: null,
      linkTxHash: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  private requireWallet(walletId: string): WalletRecord {
    const wallet = this.wallets.get(walletId);
    if (!wallet) {
      throw new Error(`Không có ví ${walletId}`);
    }
    return wallet;
  }

  private put(wallet: WalletRecord): WalletRecord {
    this.wallets.set(wallet.id, wallet);
    return wallet;
  }
}

export class FakeTransactionTracker {
  readonly tracked: TrackTransactionInput[] = [];
  readonly statuses = new Map<string, TrackedTxStatus>();

  async track(input: TrackTransactionInput): Promise<TrackedTxStatus> {
    this.tracked.push(input);
    this.statuses.set(input.txHash, 'SUBMITTED');
    return 'SUBMITTED';
  }

  async statusOf(txHash: string): Promise<TrackedTxStatus | null> {
    return this.statuses.get(txHash) ?? null;
  }
}

export class FakePartyRegistryReader implements PartyRegistryReader {
  readonly usedWallets = new Set<string>();
  readonly walletByParty = new Map<string, string>();
  /** Block được truyền vào mỗi lần gọi walletOf. */
  readonly walletOfBlocks: Array<bigint | undefined> = [];
  failing = false;

  async isWalletUsed(address: string): Promise<boolean> {
    this.throwIfFailing();
    return this.usedWallets.has(address);
  }

  async walletOf(chainPartyId: string, atBlock?: bigint): Promise<string | null> {
    this.throwIfFailing();
    this.walletOfBlocks.push(atBlock);
    return this.walletByParty.get(chainPartyId) ?? null;
  }

  private throwIfFailing(): void {
    if (this.failing) {
      throw new Error('connect ECONNREFUSED 127.0.0.1:8545');
    }
  }
}
