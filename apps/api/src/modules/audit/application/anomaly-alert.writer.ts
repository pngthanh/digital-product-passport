import type { NewAnomalyAlert } from '../domain/anomaly-alert.js';

/** Cổng ghi anomaly_alerts. */
export interface AnomalyAlertWriter {
  /** Bỏ qua nếu đã có cảnh báo OPEN cùng luật và cùng đối tượng; trả `true` khi tạo mới. */
  raiseIfNew(alert: NewAnomalyAlert): Promise<boolean>;
}

export const ANOMALY_ALERT_WRITER = Symbol('ANOMALY_ALERT_WRITER');
