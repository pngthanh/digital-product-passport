import { Inject, Injectable, Logger } from '@nestjs/common';
import type { NewAnomalyAlert } from '../domain/anomaly-alert.js';
import { ANOMALY_ALERT_WRITER, type AnomalyAlertWriter } from './anomaly-alert.writer.js';

/** Điểm vào để module khác báo bất thường; quản trị viên xem và xử lý ở M12. */
@Injectable()
export class AnomalyAlerts {
  private readonly logger = new Logger(AnomalyAlerts.name);

  constructor(@Inject(ANOMALY_ALERT_WRITER) private readonly writer: AnomalyAlertWriter) {}

  /** Trả `true` khi tạo cảnh báo mới; cảnh báo cùng loại còn OPEN thì không tạo thêm. */
  async raise(alert: NewAnomalyAlert): Promise<boolean> {
    const created = await this.writer.raiseIfNew(alert);
    if (created) {
      this.logger.warn(
        `Cảnh báo ${alert.ruleCode} (${alert.severity}): ${JSON.stringify(alert.details)}`,
      );
    }
    return created;
  }
}
