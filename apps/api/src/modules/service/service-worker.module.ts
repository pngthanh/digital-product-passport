import { Module, type OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AuditModule } from '../audit/index.js';
import { ChainSyncWorkerModule, EventProjectorRegistry } from '../chain-sync/index.js';
import { NotifierModule } from '../notifications/index.js';
import { ProductsWorkerModule } from '../products/index.js';
import { ServiceOwnerChange } from './application/service-owner-change.js';
import { ServiceTicketProjector } from './application/service-ticket.projector.js';
import { SERVICE_PORT_PROVIDERS } from './service.providers.js';

/** Phần chạy trong Worker: chiếu event ServiceTicketManager sang service_requests, service_records. */
@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    ChainSyncWorkerModule,
    ProductsWorkerModule,
    NotifierModule,
  ],
  providers: [...SERVICE_PORT_PROVIDERS, ServiceTicketProjector, ServiceOwnerChange],
  exports: [ServiceOwnerChange],
})
export class ServiceWorkerModule implements OnModuleInit {
  constructor(
    private readonly projectors: EventProjectorRegistry,
    private readonly projector: ServiceTicketProjector,
  ) {}

  onModuleInit(): void {
    this.projectors.register(this.projector);
  }
}
