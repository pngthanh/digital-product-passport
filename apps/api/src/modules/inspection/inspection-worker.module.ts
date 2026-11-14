import { Module, type OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AuditModule } from '../audit/index.js';
import { ChainSyncWorkerModule, EventProjectorRegistry } from '../chain-sync/index.js';
import { NotifierModule } from '../notifications/index.js';
import { ProductsWorkerModule } from '../products/index.js';
import { InspectionOwnerChange } from './application/inspection-owner-change.js';
import { InspectionProjector } from './application/inspection.projector.js';
import { INSPECTION_PORT_PROVIDERS } from './inspection.providers.js';

/** Phần chạy trong Worker: chiếu event InspectionRegistry sang inspection_requests, inspections. */
@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    ChainSyncWorkerModule,
    ProductsWorkerModule,
    NotifierModule,
  ],
  providers: [...INSPECTION_PORT_PROVIDERS, InspectionProjector, InspectionOwnerChange],
  exports: [InspectionOwnerChange],
})
export class InspectionWorkerModule implements OnModuleInit {
  constructor(
    private readonly projectors: EventProjectorRegistry,
    private readonly projector: InspectionProjector,
  ) {}

  onModuleInit(): void {
    this.projectors.register(this.projector);
  }
}
