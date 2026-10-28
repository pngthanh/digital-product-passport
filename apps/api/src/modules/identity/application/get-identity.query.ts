import { Inject, Injectable } from '@nestjs/common';
import { SessionRequiredError } from '../domain/identity.errors.js';
import {
  type IdentityRecord,
  PARTY_WALLET_REPOSITORY,
  type PartyWalletRepository,
} from './ports/party-wallet.repository.js';

@Injectable()
export class GetIdentity {
  constructor(@Inject(PARTY_WALLET_REPOSITORY) private readonly wallets: PartyWalletRepository) {}

  /** Tài khoản, Party và toàn bộ lịch sử ví của người đang đăng nhập. */
  async execute(userId: string): Promise<IdentityRecord> {
    const identity = await this.wallets.findIdentity(userId);
    if (!identity) {
      throw new SessionRequiredError();
    }
    return identity;
  }
}
