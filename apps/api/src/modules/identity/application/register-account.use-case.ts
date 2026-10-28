import { Inject, Injectable } from '@nestjs/common';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { AuditAction, AuditTrail } from '../../audit/index.js';
import { normalizeEmail } from '../domain/email.js';
import { WeakPasswordError } from '../domain/identity.errors.js';
import { findPasswordPolicyViolation } from '../domain/password-policy.js';
import type { UserAccount } from '../domain/user-account.js';
import { ACCOUNT_REPOSITORY, type AccountRepository } from './ports/account.repository.js';
import { PASSWORD_HASHER, type PasswordHasher } from './ports/password-hasher.port.js';
import {
  type IssuedSession,
  SESSION_TOKENS,
  type SessionTokens,
} from './ports/session-tokens.port.js';

export interface RegisterAccountCommand {
  email: string;
  password: string;
  fullName: string;
}

export interface SignedInAccount {
  account: UserAccount;
  session: IssuedSession;
}

@Injectable()
export class RegisterAccount {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(SESSION_TOKENS) private readonly sessions: SessionTokens,
    private readonly audit: AuditTrail,
  ) {}

  /** ACC-01: tạo tài khoản và Party (off-chain) rồi đăng nhập luôn; chưa ghi gì lên blockchain. */
  async execute(command: RegisterAccountCommand, client: ClientContext): Promise<SignedInAccount> {
    const email = normalizeEmail(command.email);
    const violation = findPasswordPolicyViolation(command.password, email);
    if (violation) {
      throw new WeakPasswordError(violation);
    }

    const { account, partyId } = await this.accounts.createWithParty({
      email,
      passwordHash: await this.hasher.hash(command.password),
      fullName: command.fullName.trim(),
    });
    await this.audit.record({
      action: AuditAction.ACCOUNT_REGISTERED,
      actorUserId: account.id,
      targetType: 'user',
      targetId: account.id,
      metadata: { partyId },
      client,
    });

    const session = await this.sessions.issue({
      userId: account.id,
      sessionVersion: account.sessionVersion,
    });
    return { account, session };
  }
}
