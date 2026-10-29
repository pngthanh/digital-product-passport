import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { ANOMALY_ALERT_WRITER } from './application/anomaly-alert.writer.js';
import { AnomalyAlerts } from './application/anomaly-alerts.service.js';
import { AUDIT_LOG_WRITER } from './application/audit-log.writer.js';
import { AuditTrail } from './application/audit-trail.service.js';
import { PrismaAnomalyAlertWriter } from './infrastructure/prisma-anomaly-alert.writer.js';
import { PrismaAuditLogWriter } from './infrastructure/prisma-audit-log.writer.js';

/** Ghi audit_logs và anomaly_alerts; màn hình xem, xử lý cảnh báo và các luật bất thường khác thuộc M12. */
@Module({
  imports: [DatabaseModule],
  providers: [
    AuditTrail,
    AnomalyAlerts,
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
    { provide: ANOMALY_ALERT_WRITER, useClass: PrismaAnomalyAlertWriter },
  ],
  exports: [AuditTrail, AnomalyAlerts],
})
export class AuditModule {}
