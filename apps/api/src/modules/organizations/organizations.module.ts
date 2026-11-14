import { Module } from '@nestjs/common';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AuditModule } from '../audit/index.js';
import { ChainSyncModule } from '../chain-sync/index.js';
import { IdentityModule } from '../identity/index.js';
import { GetAdminOverview } from './application/get-admin-overview.query.js';
import { GetMyOrganization } from './application/get-my-organization.query.js';
import { GetOrganizationDetail } from './application/get-organization-detail.query.js';
import { ListOrganizations } from './application/list-organizations.query.js';
import { OrganizationDirectory } from './application/organization-directory.service.js';
import { OrganizationViews } from './application/organization-views.js';
import { PrepareAdminDecision } from './application/prepare-admin-decision.use-case.js';
import { RecordAdminTransaction } from './application/record-admin-transaction.use-case.js';
import { RecordOrganizationTransaction } from './application/record-organization-transaction.use-case.js';
import { SubmitOrganizationApplication } from './application/submit-organization-application.use-case.js';
import { ORGANIZATION_STATISTICS } from './application/ports/organization-statistics.reader.js';
import { PrismaOrganizationStatistics } from './infrastructure/prisma-organization-statistics.reader.js';
import { ORGANIZATION_PORT_PROVIDERS } from './organizations.providers.js';
import { AdminController } from './presentation/admin.controller.js';
import { MyOrganizationController } from './presentation/my-organization.controller.js';

/** M4 Organizations & Fee (tiến trình API): ORG-01..04, ORG-06; M5 thêm lịch sử từng lần nộp đơn. */
@Module({
  imports: [DatabaseModule, BlockchainModule, AuditModule, ChainSyncModule, IdentityModule],
  controllers: [MyOrganizationController, AdminController],
  providers: [
    ...ORGANIZATION_PORT_PROVIDERS,
    OrganizationViews,
    GetMyOrganization,
    SubmitOrganizationApplication,
    RecordOrganizationTransaction,
    GetAdminOverview,
    ListOrganizations,
    GetOrganizationDetail,
    PrepareAdminDecision,
    RecordAdminTransaction,
    OrganizationDirectory,
    { provide: ORGANIZATION_STATISTICS, useClass: PrismaOrganizationStatistics },
  ],
  exports: [OrganizationDirectory, ORGANIZATION_STATISTICS],
})
export class OrganizationsModule {}
