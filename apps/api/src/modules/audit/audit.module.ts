import { Module } from '@nestjs/common';
import { CLOCK, SYSTEM_CLOCK } from '../../common/time/clock.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { ANOMALY_ALERT_WRITER } from './application/anomaly-alert.writer.js';
import { AnomalyAlerts } from './application/anomaly-alerts.service.js';
import { AUDIT_LOG_WRITER } from './application/audit-log.writer.js';
import { AuditRecords } from './application/audit-records.service.js';
import { AuditTrail } from './application/audit-trail.service.js';
import { ANOMALY_ALERT_REPOSITORY } from './application/ports/anomaly-alert.repository.js';
import { AUDIT_LOG_READER } from './application/ports/audit-log.reader.js';
import { ReviewAnomalyAlert } from './application/review-anomaly-alert.use-case.js';
import { PrismaAnomalyAlertRepository } from './infrastructure/prisma-anomaly-alert.repository.js';
import { PrismaAnomalyAlertWriter } from './infrastructure/prisma-anomaly-alert.writer.js';
import { PrismaAuditLogReader } from './infrastructure/prisma-audit-log.reader.js';
import { PrismaAuditLogWriter } from './infrastructure/prisma-audit-log.writer.js';

/**
 * Ghi audit_logs và anomaly_alerts cho mọi module; (M12) đọc nhật ký, cảnh báo và chốt cảnh báo
 * cho module monitoring (màn hình Admin, luật chạy nền).
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    AuditTrail,
    AnomalyAlerts,
    AuditRecords,
    ReviewAnomalyAlert,
    { provide: CLOCK, useValue: SYSTEM_CLOCK },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
    { provide: ANOMALY_ALERT_WRITER, useClass: PrismaAnomalyAlertWriter },
    { provide: AUDIT_LOG_READER, useClass: PrismaAuditLogReader },
    { provide: ANOMALY_ALERT_REPOSITORY, useClass: PrismaAnomalyAlertRepository },
  ],
  exports: [AuditTrail, AnomalyAlerts, AuditRecords, ReviewAnomalyAlert],
})
export class AuditModule {}
