import { Module } from '@nestjs/common';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AuditModule } from '../audit/index.js';
import { ChainSyncModule } from '../chain-sync/index.js';
import { IdentityModule } from '../identity/index.js';
import { OrganizationsModule } from '../organizations/index.js';
import { ProductsModule } from '../products/index.js';
import {
  CancelServiceRequest,
  GetOwnedProductService,
  ProductOwnerAccess,
  SubmitServiceRequest,
} from './application/owner-service.use-cases.js';
import { ServiceCenterAccess } from './application/service-center-access.service.js';
import {
  GetServiceEvidence,
  PrepareTicketClosing,
  PrepareTicketOpening,
  RecordServiceTransaction,
} from './application/service-ticket-commands.js';
import { GetServiceTicket, ListServiceTickets } from './application/service-ticket-queries.js';
import { ServiceViews } from './application/service-views.js';
import { OwnerServiceController } from './presentation/owner-service.controller.js';
import { ServiceTicketsController } from './presentation/service-tickets.controller.js';
import { SERVICE_PORT_PROVIDERS } from './service.providers.js';

/**
 * Service (tiến trình API). M7: SVC-01 chủ sở hữu gửi yêu cầu bảo hành, SVC-02 huỷ khi chưa tiếp
 * nhận, SVC-03 trung tâm tiếp nhận và mở phiếu (tạm dừng bảo hành), SVC-04 ghi biên bản, đóng phiếu.
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
  ],
  controllers: [OwnerServiceController, ServiceTicketsController],
  providers: [
    ...SERVICE_PORT_PROVIDERS,
    ServiceCenterAccess,
    ProductOwnerAccess,
    ServiceViews,
    GetOwnedProductService,
    SubmitServiceRequest,
    CancelServiceRequest,
    ListServiceTickets,
    GetServiceTicket,
    PrepareTicketOpening,
    PrepareTicketClosing,
    RecordServiceTransaction,
    GetServiceEvidence,
  ],
})
export class ServiceModule {}
