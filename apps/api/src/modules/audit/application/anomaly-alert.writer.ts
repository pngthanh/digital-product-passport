import type { NewAnomalyAlert } from '../domain/anomaly-alert.js';

/** Cổng ghi anomaly_alerts. */
export interface AnomalyAlertWriter {
  /** Bỏ qua cảnh báo trùng (xem `NewAnomalyAlert.dedupeKey`); trả `true` khi tạo mới. */
  raiseIfNew(alert: NewAnomalyAlert): Promise<boolean>;
}

export const ANOMALY_ALERT_WRITER = Symbol('ANOMALY_ALERT_WRITER');
