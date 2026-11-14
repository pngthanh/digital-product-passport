import { Module, type OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AuditModule } from '../audit/index.js';
import { ChainSyncWorkerModule, EventProjectorRegistry } from '../chain-sync/index.js';
import { IdentityWorkerModule } from '../identity/index.js';
import { InspectionWorkerModule } from '../inspection/index.js';
import { NotifierModule } from '../notifications/index.js';
import { ProductsWorkerModule } from '../products/index.js';
import { ServiceWorkerModule } from '../service/index.js';
import { TransferProjector } from './application/transfer.projector.js';
import { TRANSFER_PORT_PROVIDERS } from './transfer.providers.js';

/** Phần chạy trong Worker: chiếu event OwnershipTransfer sang transfer_requests. */
@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    ChainSyncWorkerModule,
    IdentityWorkerModule,
    ProductsWorkerModule,
    ServiceWorkerModule,
    InspectionWorkerModule,
    NotifierModule,
  ],
  providers: [...TRANSFER_PORT_PROVIDERS, TransferProjector],
})
export class TransferWorkerModule implements OnModuleInit {
  constructor(
    private readonly projectors: EventProjectorRegistry,
    private readonly projector: TransferProjector,
  ) {}

  onModuleInit(): void {
    this.projectors.register(this.projector);
  }
}
