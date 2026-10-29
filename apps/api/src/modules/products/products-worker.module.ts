import { Module, type OnModuleInit } from '@nestjs/common';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AuditModule } from '../audit/index.js';
import { ChainSyncWorkerModule, EventProjectorRegistry } from '../chain-sync/index.js';
import { ProductPassportProjector } from './application/product-passport.projector.js';
import { PRODUCT_PORT_PROVIDERS } from './products.providers.js';

/** Phần M5 chạy trong Worker: chiếu ProductRegistered của ProductPassport. */
@Module({
  imports: [DatabaseModule, BlockchainModule, AuditModule, ChainSyncWorkerModule],
  providers: [...PRODUCT_PORT_PROVIDERS, ProductPassportProjector],
})
export class ProductsWorkerModule implements OnModuleInit {
  constructor(
    private readonly projectors: EventProjectorRegistry,
    private readonly projector: ProductPassportProjector,
  ) {}

  onModuleInit(): void {
    this.projectors.register(this.projector);
  }
}
