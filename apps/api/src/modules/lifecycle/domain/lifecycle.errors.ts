import { DomainError } from '../../../common/domain/domain-error.js';

export class LifecycleChainNotConfiguredError extends DomainError {
  readonly code = 'LIFECYCLE_CHAIN_NOT_CONFIGURED';
  readonly kind = 'unavailable';

  constructor() {
    super(
      'Hệ thống chưa cấu hình ProductLifecycle (PRODUCT_LIFECYCLE_ADDRESS) hoặc khoá ký giấy phép nên chưa thu hồi, báo mất được.',
    );
  }
}

export class RecallManufacturerRequiredError extends DomainError {
  readonly code = 'MANUFACTURER_REQUIRED';
  readonly kind = 'forbidden';

  constructor() {
    super('Chỉ người đại diện của nhà sản xuất đã được duyệt mới thu hồi được sản phẩm.');
  }
}

export class LifecycleWalletRequiredError extends DomainError {
  readonly code = 'PERSONAL_WALLET_REQUIRED';
  readonly kind = 'conflict';

  constructor() {
    super('Liên kết ví MetaMask ở trang Tài khoản trước. Ví cá nhân của bạn ký giao dịch này.');
  }
}

export class LifecycleProductNotFoundError extends DomainError {
  readonly code = 'PRODUCT_NOT_FOUND';
  readonly kind = 'not_found';

  constructor() {
    super('Không tìm thấy sản phẩm.');
  }
}

/** Danh sách thu hồi không hợp lệ: sản phẩm không thuộc nhà sản xuất, đã ở trạng thái cuối... */
export class RecallNotAllowedError extends DomainError {
  readonly code = 'RECALL_NOT_ALLOWED';
  readonly kind = 'conflict';
}
