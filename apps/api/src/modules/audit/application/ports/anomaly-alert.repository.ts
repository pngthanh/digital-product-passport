import type { AlertStatusCode, AnomalySeverityLevel } from '@dpp/shared';
import type {
  AlertReviewDecision,
  AnomalyAlertFilter,
  AnomalyAlertRecord,
} from '../../domain/audit-records.js';

/** Đọc và xử lý anomaly_alerts (AUD-04). Tạo cảnh báo đi qua AnomalyAlertWriter. */
export interface AnomalyAlertRepository {
  page(filter: AnomalyAlertFilter, limit: number): Promise<AnomalyAlertRecord[]>;
  find(id: string): Promise<AnomalyAlertRecord | null>;
  countByStatus(): Promise<Record<AlertStatusCode, number>>;
  openBySeverity(): Promise<Record<AnomalySeverityLevel, number>>;
  /** Chỉ đổi khi cảnh báo còn OPEN; trả `false` nếu đã có người xử lý trước. */
  review(id: string, decision: AlertReviewDecision): Promise<boolean>;
}

export const ANOMALY_ALERT_REPOSITORY = Symbol('ANOMALY_ALERT_REPOSITORY');
