import { Inject, Injectable } from '@nestjs/common';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { AuditAction, AuditTrail } from '../../audit/index.js';
import { normalizeEmail } from '../domain/email.js';
import { AccountNotActiveError, InvalidCredentialsError } from '../domain/identity.errors.js';
import { canSignIn } from '../domain/user-account.js';
import { ACCOUNT_REPOSITORY, type AccountRepository } from './ports/account.repository.js';
import { PASSWORD_HASHER, type PasswordHasher } from './ports/password-hasher.port.js';
import { SESSION_TOKENS, type SessionTokens } from './ports/session-tokens.port.js';
import type { SignedInAccount } from './register-account.use-case.js';

export interface SignInCommand {
  email: string;
  password: string;
}

@Injectable()
export class SignIn {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(SESSION_TOKENS) private readonly sessions: SessionTokens,
    private readonly audit: AuditTrail,
  ) {}

  /**
   * ACC-02: kiểm tra mật khẩu Argon2id rồi cấp JWT mang session_version hiện tại.
   * Sai email hay sai mật khẩu đều trả cùng một lỗi, cùng thời gian xử lý.
   */
  async execute(command: SignInCommand, client: ClientContext): Promise<SignedInAccount> {
    const email = normalizeEmail(command.email);
    const account = await this.accounts.findByEmail(email);
    const passwordMatches = account
      ? await this.hasher.verify(account.passwordHash, command.password)
      : await this.hasher.verifyDummy(command.password).then(() => false);

    if (!account || !passwordMatches) {
      await this.audit.record({
        action: AuditAction.SIGN_IN_FAILED,
        actorUserId: null,
        targetType: 'user',
        targetId: account?.id ?? null,
        metadata: { email },
        client,
      });
      throw new InvalidCredentialsError();
    }
    if (!canSignIn(account)) {
      throw new AccountNotActiveError();
    }

    const session = await this.sessions.issue({
      userId: account.id,
      sessionVersion: account.sessionVersion,
    });
    await this.audit.record({
      action: AuditAction.SIGNED_IN,
      actorUserId: account.id,
      targetType: 'user',
      targetId: account.id,
      client,
    });
    return { account, session };
  }
}
