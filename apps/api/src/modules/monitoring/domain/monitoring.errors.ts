import { DomainError } from '../../../common/domain/domain-error.js';

export class MonitoringAlertNotFoundError extends DomainError {
  readonly code = 'ALERT_NOT_FOUND';
  readonly kind = 'not_found';

  constructor() {
    super('Không có cảnh báo này.');
  }
}
