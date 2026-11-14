import { Module } from '@nestjs/common';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AuditModule } from '../audit/index.js';
import { ChainSyncModule } from '../chain-sync/index.js';
import { IdentityModule } from '../identity/index.js';
import { OrganizationsModule } from '../organizations/index.js';
import { ProductsModule } from '../products/index.js';
import { ServiceModule } from '../service/index.js';
import { LifecycleNotices } from './application/lifecycle-notices.js';
import {
  GetOwnedProductLifecycle,
  GetPublicLifecycle,
  RecordLifecycleTransaction,
} from './application/owner-lifecycle.use-cases.js';
import { PrepareRecall, RecallManufacturerAccess } from './application/recall.use-cases.js';
import { LIFECYCLE_PORT_PROVIDERS } from './lifecycle.providers.js';
import {
  OwnerLifecycleController,
  PublicLifecycleController,
  RecallController,
} from './presentation/lifecycle.controllers.js';

/**
 * Lifecycle (tiến trình API). M10: RCL-01 nhà sản xuất thu hồi một lô (giấy phép registrar),
 * LIF-01, LIF-02 chủ sở hữu báo mất, ngừng sử dụng bằng ví của mình; cảnh báo trên hộ chiếu.
 */
@Module({
  imports: [
    DatabaseModule,
    BlockchainModule,
    AuditModule,
    ChainSyncModule,
    IdentityModule,
    OrganizationsModule,
    ProductsModule,
    ServiceModule,
  ],
  controllers: [RecallController, OwnerLifecycleController, PublicLifecycleController],
  providers: [
    ...LIFECYCLE_PORT_PROVIDERS,
    LifecycleNotices,
    RecallManufacturerAccess,
    PrepareRecall,
    GetOwnedProductLifecycle,
    GetPublicLifecycle,
    RecordLifecycleTransaction,
  ],
})
export class LifecycleModule {}
