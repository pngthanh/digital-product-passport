// Public API của module audit — module khác chỉ import từ đây.
export { AuditModule } from './audit.module.js';
export { AuditTrail } from './application/audit-trail.service.js';
export { AuditAction, type AuditEntry } from './domain/audit-entry.js';
export { AnomalyAlerts } from './application/anomaly-alerts.service.js';
export { AnomalyRule, type AnomalySeverity, type NewAnomalyAlert } from './domain/anomaly-alert.js';
export { AuditRecords, ALERT_TARGET_TYPE } from './application/audit-records.service.js';
export {
  ReviewAnomalyAlert,
  type ReviewAlertCommand,
} from './application/review-anomaly-alert.use-case.js';
export type {
  AnomalyAlertFilter,
  AnomalyAlertRecord,
  AuditLogFilter,
  AuditLogRecord,
  SignInFailureGroup,
} from './domain/audit-records.js';
