import { Module, type OnModuleInit } from '@nestjs/common';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AuditModule } from '../audit/index.js';
import { ChainSyncWorkerModule, EventProjectorRegistry } from '../chain-sync/index.js';
import { OrganizationRegistryProjector } from './application/organization-registry.projector.js';
import { ORGANIZATION_PORT_PROVIDERS } from './organizations.providers.js';

/** Phần M4 chạy trong Worker: chiếu event tổ chức, phí và Treasury của PartyRegistry. */
@Module({
  imports: [DatabaseModule, BlockchainModule, AuditModule, ChainSyncWorkerModule],
  providers: [...ORGANIZATION_PORT_PROVIDERS, OrganizationRegistryProjector],
})
export class OrganizationsWorkerModule implements OnModuleInit {
  constructor(
    private readonly projectors: EventProjectorRegistry,
    private readonly projector: OrganizationRegistryProjector,
  ) {}

  onModuleInit(): void {
    this.projectors.register(this.projector);
  }
}
