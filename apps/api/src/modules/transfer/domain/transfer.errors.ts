import { DomainError } from '../../../common/domain/domain-error.js';

export class TransferChainNotConfiguredError extends DomainError {
  readonly code = 'TRANSFER_CHAIN_NOT_CONFIGURED';
  readonly kind = 'unavailable';

  constructor() {
    super(
      'Hệ thống chưa cấu hình OwnershipTransfer (OWNERSHIP_TRANSFER_ADDRESS) hoặc khoá ký giấy phép nên chưa chuyển nhượng được.',
    );
  }
}

export class TransferProductNotFoundError extends DomainError {
  readonly code = 'PRODUCT_NOT_FOUND';
  readonly kind = 'not_found';

  constructor() {
    super('Không tìm thấy sản phẩm.');
  }
}

export class TransferWalletRequiredError extends DomainError {
  readonly code = 'PERSONAL_WALLET_REQUIRED';
  readonly kind = 'conflict';

  constructor() {
    super(
      'Liên kết ví MetaMask ở trang Tài khoản trước. Ví cá nhân của bạn ký giao dịch chuyển nhượng.',
    );
  }
}

/** Lý do không tạo được yêu cầu (sản phẩm không còn có chủ, đang sửa, đã có yêu cầu mở...). */
export class TransferNotAllowedError extends DomainError {
  readonly code = 'TRANSFER_NOT_ALLOWED';
  readonly kind = 'conflict';
}

export class TransferRecipientNotFoundError extends DomainError {
  readonly code = 'TRANSFER_RECIPIENT_NOT_FOUND';
  readonly kind = 'invalid';

  constructor() {
    super(
      'Không tìm thấy bên nhận. Nhập email tài khoản cá nhân, hoặc mã số thuế của doanh nghiệp đã được duyệt.',
    );
  }
}

export class TransferRecipientInvalidError extends DomainError {
  readonly code = 'TRANSFER_RECIPIENT_INVALID';
  readonly kind = 'invalid';
}
