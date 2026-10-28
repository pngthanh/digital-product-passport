import { Inject, Injectable } from '@nestjs/common';
import {
  type AuthenticatedUser,
  isSessionValid,
  toAuthenticatedUser,
} from '../domain/user-account.js';
import { ACCOUNT_REPOSITORY, type AccountRepository } from './ports/account.repository.js';
import { SESSION_TOKENS, type SessionTokens } from './ports/session-tokens.port.js';

@Injectable()
export class ResolveSession {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(SESSION_TOKENS) private readonly sessions: SessionTokens,
  ) {}

  /** Xác thực JWT trong cookie và đối chiếu session_version, trạng thái tài khoản trong CSDL. */
  async execute(token: string | undefined): Promise<AuthenticatedUser | null> {
    if (!token) {
      return null;
    }
    const claims = await this.sessions.verify(token);
    if (!claims) {
      return null;
    }
    const account = await this.accounts.findById(claims.userId);
    return account && isSessionValid(account, claims.sessionVersion)
      ? toAuthenticatedUser(account)
      : null;
  }
}
