import { Inject, Injectable } from '@nestjs/common';
import type { AlertDecision } from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import { AlertAlreadyReviewedError, AlertNotFoundError } from '../domain/audit.errors.js';
import { AuditAction } from '../domain/audit-entry.js';
import { ALERT_TARGET_TYPE } from './audit-records.service.js';
import { AuditTrail } from './audit-trail.service.js';
import {
  ANOMALY_ALERT_REPOSITORY,
  type AnomalyAlertRepository,
} from './ports/anomaly-alert.repository.js';

export interface ReviewAlertCommand {
  alertId: string;
  decision: AlertDecision;
  /** Đã chuẩn hoá và kiểm độ dài ở tầng presentation. */
  note: string;
  reviewerUserId: string;
  client: ClientContext;
}

/**
 * AUD-04 (M12): Admin chốt cảnh báo đang mở là đã xử lý (ACKNOWLEDGED) hoặc báo nhầm (DISMISSED).
 * Ghi chú nằm ở audit_logs (ALERT_REVIEWED), nên vẫn chỉ INSERT vào nhật ký.
 */
@Injectable()
export class ReviewAnomalyAlert {
  constructor(
    @Inject(ANOMALY_ALERT_REPOSITORY) private readonly alerts: AnomalyAlertRepository,
    private readonly audit: AuditTrail,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ReviewAlertCommand): Promise<void> {
    const alert = await this.alerts.find(command.alertId);
    if (!alert) {
      throw new AlertNotFoundError();
    }
    const reviewed = await this.alerts.review(alert.id, {
      decision: command.decision,
      reviewerUserId: command.reviewerUserId,
      at: this.clock.now(),
    });
    if (!reviewed) {
      throw new AlertAlreadyReviewedError();
    }
    await this.audit.record({
      action: AuditAction.ALERT_REVIEWED,
      actorUserId: command.reviewerUserId,
      targetType: ALERT_TARGET_TYPE,
      targetId: alert.id,
      metadata: {
        decision: command.decision,
        note: command.note,
        ruleCode: alert.ruleCode,
        severity: alert.severity,
      },
      client: command.client,
    });
  }
}
