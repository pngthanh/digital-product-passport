import { Inject, Injectable } from '@nestjs/common';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { AuditAction, AuditTrail } from '../../audit/index.js';
import { ACCOUNT_REPOSITORY, type AccountRepository } from './ports/account.repository.js';

@Injectable()
export class SignOut {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    private readonly audit: AuditTrail,
  ) {}

  /** ACC-02: tăng session_version, mọi JWT đã cấp cho tài khoản (mọi thiết bị) hết hiệu lực ngay. */
  async execute(userId: string, client: ClientContext): Promise<void> {
    await this.accounts.incrementSessionVersion(userId);
    await this.audit.record({
      action: AuditAction.SIGNED_OUT,
      actorUserId: userId,
      targetType: 'user',
      targetId: userId,
      client,
    });
  }
}
