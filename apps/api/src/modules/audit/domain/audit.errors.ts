import { DomainError } from '../../../common/domain/domain-error.js';

export class AlertNotFoundError extends DomainError {
  readonly code = 'ALERT_NOT_FOUND';
  readonly kind = 'not_found';

  constructor() {
    super('Không có cảnh báo này.');
  }
}

export class AlertAlreadyReviewedError extends DomainError {
  readonly code = 'ALERT_ALREADY_REVIEWED';
  readonly kind = 'conflict';

  constructor() {
    super('Cảnh báo này đã được xử lý. Tải lại trang để xem kết quả.');
  }
}
