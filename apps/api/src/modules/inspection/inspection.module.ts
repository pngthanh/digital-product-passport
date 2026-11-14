import { Module } from '@nestjs/common';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AuditModule } from '../audit/index.js';
import { ChainSyncModule } from '../chain-sync/index.js';
import { IdentityModule } from '../identity/index.js';
import { OrganizationsModule } from '../organizations/index.js';
import { NotifierModule } from '../notifications/index.js';
import { ProductsModule } from '../products/index.js';
import {
  DeclineInspectionRequest,
  GetInspectionReport,
  PrepareInspectionRecord,
  RecordInspectionTransaction,
} from './application/inspection-commands.js';
import {
  GetInspection,
  GetPublicInspections,
  ListInspections,
} from './application/inspection-queries.js';
import { InspectionViews } from './application/inspection-views.js';
import { InspectorAccess } from './application/inspector-access.service.js';
import { InspectionRequesterAccess } from './application/requester-access.service.js';
import {
  CancelInspectionRequest,
  GetProductInspection,
  SubmitInspectionRequest,
} from './application/requester.use-cases.js';
import { INSPECTION_PORT_PROVIDERS } from './inspection.providers.js';
import { InspectionsController } from './presentation/inspections.controller.js';
import { PublicInspectionsController } from './presentation/public-inspections.controller.js';
import { RequesterInspectionController } from './presentation/requester-inspection.controller.js';

/**
 * Inspection (tiến trình API). M8: INS-02 nhà sản xuất hoặc chủ sở hữu gửi yêu cầu kiểm định,
 * INS-03 huỷ khi chưa có kết quả, INS-01 đơn vị kiểm định ghi kết quả và hash biên bản lên
 * InspectionRegistry, INS-04 từ chối kèm lý do; kết quả công khai trên hộ chiếu.
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
    NotifierModule,
  ],
  controllers: [RequesterInspectionController, InspectionsController, PublicInspectionsController],
  providers: [
    ...INSPECTION_PORT_PROVIDERS,
    InspectorAccess,
    InspectionRequesterAccess,
    InspectionViews,
    GetProductInspection,
    SubmitInspectionRequest,
    CancelInspectionRequest,
    ListInspections,
    GetInspection,
    GetPublicInspections,
    PrepareInspectionRecord,
    DeclineInspectionRequest,
    RecordInspectionTransaction,
    GetInspectionReport,
  ],
})
export class InspectionModule {}
