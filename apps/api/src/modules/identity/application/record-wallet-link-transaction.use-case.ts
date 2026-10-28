import { Inject, Injectable } from '@nestjs/common';
import { normalizeBytes32, PARTY_REGISTRY_CONTRACT_NAME } from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { AuditAction, AuditTrail } from '../../audit/index.js';
import { TRANSACTION_TRACKING, type TransactionTracking } from '../../chain-sync/index.js';
import { SessionRequiredError, WalletLinkNotFoundError } from '../domain/identity.errors.js';
import type { AuthenticatedUser } from '../domain/user-account.js';
import {
  PARTY_WALLET_REPOSITORY,
  type PartyWalletRepository,
  type WalletRecord,
} from './ports/party-wallet.repository.js';

@Injectable()
export class RecordWalletLinkTransaction {
  constructor(
    @Inject(PARTY_WALLET_REPOSITORY) private readonly wallets: PartyWalletRepository,
    @Inject(TRANSACTION_TRACKING) private readonly tracker: TransactionTracking,
    private readonly audit: AuditTrail,
  ) {}

  /**
   * ACC-03/04 bước 3: web báo txHash sau khi MetaMask gửi giao dịch. Kiểm tra giao dịch gửi từ
   * đúng ví, tới đúng PartyRegistry, gọi đúng hàm; Worker sẽ kích hoạt ví khi block finalized.
   */
  async execute(
    user: AuthenticatedUser,
    walletId: string,
    txHash: string,
    client: ClientContext,
  ): Promise<WalletRecord> {
    const identity = await this.wallets.findIdentity(user.id);
    if (!identity) {
      throw new SessionRequiredError();
    }
    const personal = identity.wallets.filter((wallet) => wallet.walletRole === 'PERSONAL');
    const pending = personal.find(
      (wallet) => wallet.id === walletId && wallet.status === 'PENDING',
    );
    if (!pending) {
      throw new WalletLinkNotFoundError();
    }
    const rotating = personal.some((wallet) => wallet.status === 'ACTIVE');

    const normalizedHash = normalizeBytes32(txHash);
    await this.tracker.track({
      txHash: normalizedHash,
      contractName: PARTY_REGISTRY_CONTRACT_NAME,
      expectedFrom: pending.address,
      expectedMethods: [rotating ? 'rotateWallet' : 'registerUser'],
      initiatedByUserId: user.id,
    });
    const wallet = await this.wallets.attachLinkTransaction(pending.id, normalizedHash);
    await this.audit.record({
      action: AuditAction.WALLET_LINK_SUBMITTED,
      actorUserId: user.id,
      targetType: 'party_wallet',
      targetId: wallet.id,
      metadata: { txHash: normalizedHash },
      client,
    });
    return wallet;
  }
}
