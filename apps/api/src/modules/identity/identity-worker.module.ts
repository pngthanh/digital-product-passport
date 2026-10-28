import { Module, type OnModuleInit } from '@nestjs/common';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AuditModule } from '../audit/index.js';
import { ChainSyncWorkerModule, EventProjectorRegistry } from '../chain-sync/index.js';
import { ExpireWalletLinks } from './application/expire-wallet-links.use-case.js';
import { PartyRegistryProjector } from './application/party-registry.projector.js';
import { IDENTITY_PORT_PROVIDERS } from './identity.providers.js';
import { WalletLinkExpiryScheduler } from './presentation/wallet-link-expiry.scheduler.js';

/** Phần M2 chạy trong Worker: chiếu event PartyRegistry và dọn yêu cầu liên kết ví quá hạn. */
@Module({
  imports: [DatabaseModule, BlockchainModule, AuditModule, ChainSyncWorkerModule],
  providers: [
    ...IDENTITY_PORT_PROVIDERS,
    PartyRegistryProjector,
    ExpireWalletLinks,
    WalletLinkExpiryScheduler,
  ],
  exports: [ExpireWalletLinks],
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
