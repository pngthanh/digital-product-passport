import { Module, type OnModuleInit } from '@nestjs/common';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AuditModule } from '../audit/index.js';
import { ChainSyncWorkerModule, EventProjectorRegistry } from '../chain-sync/index.js';
import { IdentityWorkerModule } from '../identity/index.js';
import { NotifierModule } from '../notifications/index.js';
import { ExpireWarranties } from './application/expire-warranties.use-case.js';
import { PRODUCT_STATISTICS } from './application/ports/product-statistics.reader.js';
import { ProductDirectory } from './application/product-directory.service.js';
import { ProductPassportProjector } from './application/product-passport.projector.js';
import { WarrantyManagerProjector } from './application/warranty-manager.projector.js';
import { PrismaProductStatistics } from './infrastructure/prisma-product-statistics.reader.js';
import { PRODUCT_PORT_PROVIDERS } from './products.providers.js';
import { WarrantyExpiryScheduler } from './presentation/warranty-expiry.scheduler.js';

/** Phần chạy trong Worker: chiếu event ProductPassport, WarrantyManager và đồng bộ bảo hành hết hạn. */
@Module({
  imports: [
    DatabaseModule,
    BlockchainModule,
    AuditModule,
    ChainSyncWorkerModule,
    IdentityWorkerModule,
    NotifierModule,
  ],
  providers: [
    ...PRODUCT_PORT_PROVIDERS,
    ProductPassportProjector,
    WarrantyManagerProjector,
    ExpireWarranties,
    WarrantyExpiryScheduler,
    ProductDirectory,
    { provide: PRODUCT_STATISTICS, useClass: PrismaProductStatistics },
  ],
  exports: [ExpireWarranties, ProductDirectory, PRODUCT_STATISTICS],
})
export class ProductsWorkerModule implements OnModuleInit {
  constructor(
    private readonly projectors: EventProjectorRegistry,
    private readonly passportProjector: ProductPassportProjector,
    private readonly warrantyProjector: WarrantyManagerProjector,
  ) {}

  onModuleInit(): void {
    this.projectors.register(this.passportProjector);
    this.projectors.register(this.warrantyProjector);
  }
}
