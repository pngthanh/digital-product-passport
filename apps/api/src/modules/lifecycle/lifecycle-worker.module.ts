import { Module, type OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AuditModule } from '../audit/index.js';
import { ChainSyncWorkerModule, EventProjectorRegistry } from '../chain-sync/index.js';
import { InspectionWorkerModule } from '../inspection/index.js';
import { NotifierModule } from '../notifications/index.js';
import { ProductsWorkerModule } from '../products/index.js';
import { ServiceWorkerModule } from '../service/index.js';
import { LifecycleProjector } from './application/lifecycle.projector.js';
import { LIFECYCLE_PORT_PROVIDERS } from './lifecycle.providers.js';

/** Phần chạy trong Worker: chiếu event ProductLifecycle (recalls, thông báo, huỷ yêu cầu đang chờ). */
@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    ChainSyncWorkerModule,
    ProductsWorkerModule,
    ServiceWorkerModule,
    InspectionWorkerModule,
    NotifierModule,
  ],
  providers: [...LIFECYCLE_PORT_PROVIDERS, LifecycleProjector],
})
export class LifecycleWorkerModule implements OnModuleInit {
  constructor(
    private readonly projectors: EventProjectorRegistry,
    private readonly projector: LifecycleProjector,
  ) {}

  onModuleInit(): void {
    this.projectors.register(this.projector);
  }
}
