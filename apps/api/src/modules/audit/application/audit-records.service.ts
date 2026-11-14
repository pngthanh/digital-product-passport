import { Inject, Injectable } from '@nestjs/common';
import type { AlertStatusCode, AnomalySeverityLevel } from '@dpp/shared';
import type {
  AnomalyAlertFilter,
  AnomalyAlertRecord,
  AuditLogFilter,
  AuditLogRecord,
  SignInFailureGroup,
} from '../domain/audit-records.js';
import { AuditAction } from '../domain/audit-entry.js';
import {
  ANOMALY_ALERT_REPOSITORY,
  type AnomalyAlertRepository,
} from './ports/anomaly-alert.repository.js';
import { AUDIT_LOG_READER, type AuditLogReader } from './ports/audit-log.reader.js';

/** Loại đối tượng của dòng audit khi Admin xử lý cảnh báo. */
export const ALERT_TARGET_TYPE = 'anomaly_alert';

/**
 * (M12) Public API chỉ đọc của audit: nhật ký (AUD-01), cảnh báo (AUD-04), số liệu cho dashboard
 * (AUD-02) và luật nền (AUD-03). Module khác không đọc thẳng hai bảng này.
 */
@Injectable()
export class AuditRecords {
  constructor(
    @Inject(AUDIT_LOG_READER) private readonly logs: AuditLogReader,
    @Inject(ANOMALY_ALERT_REPOSITORY) private readonly alerts: AnomalyAlertRepository,
  ) {}

  auditPage(filter: AuditLogFilter, limit: number): Promise<AuditLogRecord[]> {
    return this.logs.page(filter, limit);
  }

  alertPage(filter: AnomalyAlertFilter, limit: number): Promise<AnomalyAlertRecord[]> {
    return this.alerts.page(filter, limit);
  }

  alert(id: string): Promise<AnomalyAlertRecord | null> {
    return this.alerts.find(id);
  }

  alertCounts(): Promise<Record<AlertStatusCode, number>> {
    return this.alerts.countByStatus();
  }

  openAlertsBySeverity(): Promise<Record<AnomalySeverityLevel, number>> {
    return this.alerts.openBySeverity();
  }

  /** Dòng ALERT_REVIEWED mới nhất của từng cảnh báo (có ghi chú của Admin). */
  reviewsOf(alertIds: readonly string[]): Promise<Map<string, AuditLogRecord>> {
    return this.logs.latestFor(AuditAction.ALERT_REVIEWED, ALERT_TARGET_TYPE, alertIds);
  }

  signInFailures(since: Date, minCount: number): Promise<SignInFailureGroup[]> {
    return this.logs.signInFailures(since, minCount);
  }
}
