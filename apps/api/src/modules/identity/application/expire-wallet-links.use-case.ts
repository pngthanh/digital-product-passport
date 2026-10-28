import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import { TRANSACTION_TRACKING, type TransactionTracking } from '../../chain-sync/index.js';
import {
  PARTY_REGISTRY_READER,
  type PartyRegistryReader,
} from './ports/party-registry-reader.port.js';
import {
  PARTY_WALLET_REPOSITORY,
  type PartyWalletRepository,
} from './ports/party-wallet.repository.js';
import {
  WALLET_LINK_AUTHORIZER,
  type WalletLinkAuthorizer,
} from './ports/wallet-link-authorizer.port.js';
import { WALLET_LINK_SETTINGS, type WalletLinkSettings } from './ports/wallet-link-settings.js';

/** Đợi thêm sau hạn giấy phép để giao dịch gửi sát hạn kịp được chốt. */
const GRACE_PERIOD_MS = 5 * 60_000;

@Injectable()
export class ExpireWalletLinks {
  constructor(
    @Inject(PARTY_WALLET_REPOSITORY) private readonly wallets: PartyWalletRepository,
    @Inject(PARTY_REGISTRY_READER) private readonly registry: PartyRegistryReader,
    @Inject(WALLET_LINK_AUTHORIZER) private readonly authorizer: WalletLinkAuthorizer,
    @Inject(WALLET_LINK_SETTINGS) private readonly settings: WalletLinkSettings,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TRANSACTION_TRACKING) private readonly tracker: TransactionTracking,
  ) {}

  /**
   * Scheduler: bỏ yêu cầu liên kết ví đã quá hạn giấy phép mà không thành công on-chain,
   * để địa chỉ ví được giải phóng. Giữ lại khi giao dịch còn chờ hoặc ví đã lên chain.
   */
  async runOnce(): Promise<number> {
    if (!this.authorizer.contractAddress) {
      return 0;
    }
    const cutoff = new Date(
      this.clock.now().getTime() - this.settings.authorizationTtlSeconds * 1000 - GRACE_PERIOD_MS,
    );
    let removed = 0;
    for (const wallet of await this.wallets.listStalePending(cutoff)) {
      const txStatus = wallet.linkTxHash ? await this.tracker.statusOf(wallet.linkTxHash) : null;
      if (txStatus === 'SUBMITTED' || txStatus === 'CONFIRMED') {
        continue;
      }
      // Ví đã lên chain nhưng web chưa kịp báo txHash: để Indexer (M3) chiếu event, không xoá.
      if (!wallet.linkTxHash && (await this.registry.isWalletUsed(wallet.address))) {
        continue;
      }
      await this.wallets.deletePending(wallet.id);
      removed += 1;
    }
    return removed;
  }
}
