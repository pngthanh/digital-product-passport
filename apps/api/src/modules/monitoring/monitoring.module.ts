import { Module } from '@nestjs/common';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module.js';
import { AuditModule } from '../audit/index.js';
import { ChainSyncModule } from '../chain-sync/index.js';
import { IdentityModule } from '../identity/index.js';
import { InspectionModule } from '../inspection/index.js';
import { OrganizationsModule } from '../organizations/index.js';
import { ProductsModule } from '../products/index.js';
import { ServiceModule } from '../service/index.js';
import { TransferModule } from '../transfer/index.js';
import { GetDashboardStatistics } from './application/dashboard.query.js';
import {
  AlertViews,
  GetAlertSummary,
  GetAnomalyAlert,
  ListAnomalyAlerts,
  ListAuditLogs,
} from './application/monitoring-queries.js';
import { MONITORING_PORT_PROVIDERS } from './monitoring.providers.js';
import { AdminMonitoringController } from './presentation/admin-monitoring.controllers.js';

/**
 * Monitoring (tiến trình API). M12: AUD-01 nhật ký kiểm toán, AUD-02 dashboard, AUD-04 xử lý cảnh
 * báo. Chỉ đọc qua public API của các module khác; module này không sở hữu bảng nào.
 */
@Module({
  imports: [
    BlockchainModule,
    AuditModule,
    ChainSyncModule,
    IdentityModule,
    OrganizationsModule,
    ProductsModule,
    ServiceModule,
    InspectionModule,
    TransferModule,
  ],
  controllers: [AdminMonitoringController],
  providers: [
    ...MONITORING_PORT_PROVIDERS,
    GetDashboardStatistics,
    ListAuditLogs,
    AlertViews,
    ListAnomalyAlerts,
    GetAnomalyAlert,
    GetAlertSummary,
  ],
})
export class MonitoringModule {}
