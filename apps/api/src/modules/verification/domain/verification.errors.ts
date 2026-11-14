import { DomainError } from '../../../common/domain/domain-error.js';

export class VerificationProductNotFoundError extends DomainError {
  readonly code = 'PRODUCT_NOT_FOUND';
  readonly kind = 'not_found';

  constructor() {
    super('Không có sản phẩm nào đã ghi lên blockchain với mã này.');
  }
}
