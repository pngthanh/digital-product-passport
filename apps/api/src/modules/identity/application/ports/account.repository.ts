import type { UserAccount } from '../../domain/user-account.js';

export interface NewAccount {
  email: string;
  passwordHash: string;
  fullName: string;
}

/** Bảng users (và dòng parties đi kèm khi đăng ký). */
export interface AccountRepository {
  findByEmail(email: string): Promise<UserAccount | null>;
  findById(userId: string): Promise<UserAccount | null>;
  /** Tạo users + parties(USER) trong một giao dịch; email trùng ném EmailAlreadyRegisteredError. */
  createWithParty(account: NewAccount): Promise<{ account: UserAccount; partyId: string }>;
  incrementSessionVersion(userId: string): Promise<void>;
}

export const ACCOUNT_REPOSITORY = Symbol('ACCOUNT_REPOSITORY');
