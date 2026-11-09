import { DomainError } from '../../../common/domain/domain-error.js';

export class ServiceChainNotConfiguredError extends DomainError {
  readonly code = 'SERVICE_CHAIN_NOT_CONFIGURED';
  readonly kind = 'unavailable';

  constructor() {
    super(
      'Hệ thống chưa cấu hình ServiceTicketManager (SERVICE_TICKET_MANAGER_ADDRESS) hoặc khoá ký giấy phép nên chưa tiếp nhận bảo hành được.',
    );
  }
}

export class ServiceCenterRequiredError extends DomainError {
  readonly code = 'SERVICE_CENTER_REQUIRED';
  readonly kind = 'forbidden';

  constructor() {
    super('Chỉ người đại diện của trung tâm bảo hành đã được duyệt mới tiếp nhận sửa chữa được.');
  }
}

export class ServiceWalletRequiredError extends DomainError {
  readonly code = 'PERSONAL_WALLET_REQUIRED';
  readonly kind = 'conflict';

  constructor() {
    super(
      'Liên kết ví MetaMask ở trang Tài khoản trước. Ví cá nhân của bạn ký giao dịch mở và đóng phiếu sửa chữa.',
    );
  }
}

export class ServiceProductNotFoundError extends DomainError {
  readonly code = 'PRODUCT_NOT_FOUND';
  readonly kind = 'not_found';

  constructor() {
    super('Không tìm thấy sản phẩm.');
  }
}

export class ServiceProductNotOwnedError extends DomainError {
  readonly code = 'SERVICE_PRODUCT_NOT_OWNED';
  readonly kind = 'conflict';

  constructor() {
    super(
      'Sản phẩm không còn ở trạng thái đã có chủ (đã chuyển nhượng, thu hồi hoặc báo mất). Tải lại trang.',
    );
  }
}

export class ServiceCenterNotFoundError extends DomainError {
  readonly code = 'SERVICE_CENTER_NOT_FOUND';
  readonly kind = 'invalid';

  constructor() {
    super('Trung tâm bảo hành không tồn tại hoặc chưa được duyệt. Chọn trung tâm khác.');
  }
}

export class ServiceRequestOpenError extends DomainError {
  readonly code = 'SERVICE_REQUEST_OPEN';
  readonly kind = 'conflict';

  constructor() {
    super(
      'Sản phẩm đang có một yêu cầu bảo hành chưa xong. Huỷ yêu cầu đó (khi trung tâm chưa tiếp nhận) hoặc chờ trung tâm đóng phiếu.',
    );
  }
}

export class ServiceRequestNotFoundError extends DomainError {
  readonly code = 'SERVICE_REQUEST_NOT_FOUND';
  readonly kind = 'not_found';

  constructor() {
    super('Không tìm thấy yêu cầu bảo hành.');
  }
}

export class ServiceRequestStateError extends DomainError {
  readonly code = 'SERVICE_REQUEST_STATE';
  readonly kind = 'conflict';
}

export class ServiceEvidenceNotFoundError extends DomainError {
  readonly code = 'SERVICE_EVIDENCE_NOT_FOUND';
  readonly kind = 'not_found';

  constructor() {
    super('Phiếu này không có file biên bản.');
  }
}
