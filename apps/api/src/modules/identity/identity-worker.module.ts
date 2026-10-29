import { Module, type OnModuleInit } from '@nestjs/common';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AuditModule } from '../audit/index.js';
import { ChainSyncWorkerModule, EventProjectorRegistry } from '../chain-sync/index.js';
import { ExpireWalletLinks } from './application/expire-wallet-links.use-case.js';
import { IdentityDirectory } from './application/identity-directory.service.js';
import { PartyRegistryProjector } from './application/party-registry.projector.js';
import { ReconcilePartyWallets } from './application/reconcile-party-wallets.use-case.js';
import { IDENTITY_PORT_PROVIDERS } from './identity.providers.js';
import { PartyWalletReconciliationScheduler } from './presentation/party-wallet-reconciliation.scheduler.js';
import { WalletLinkExpiryScheduler } from './presentation/wallet-link-expiry.scheduler.js';

/** Phần chạy trong Worker: chiếu event PartyRegistry, dọn yêu cầu liên kết ví quá hạn, đối soát ví; cho module khác tra Party. */
@Module({
  imports: [DatabaseModule, BlockchainModule, AuditModule, ChainSyncWorkerModule],
  providers: [
    ...IDENTITY_PORT_PROVIDERS,
    PartyRegistryProjector,
    IdentityDirectory,
    ExpireWalletLinks,
    ReconcilePartyWallets,
    WalletLinkExpiryScheduler,
    PartyWalletReconciliationScheduler,
  ],
  exports: [ExpireWalletLinks, ReconcilePartyWallets, IdentityDirectory],
})
export class IdentityWorkerModule implements OnModuleInit {
  constructor(
    private readonly projectors: EventProjectorRegistry,
    private readonly partyRegistryProjector: PartyRegistryProjector,
  ) {}

  onModuleInit(): void {
    this.projectors.register(this.partyRegistryProjector);
  }
}
