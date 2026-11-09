import { DomainError } from '../../../common/domain/domain-error.js';

export class InspectionChainNotConfiguredError extends DomainError {
  readonly code = 'INSPECTION_CHAIN_NOT_CONFIGURED';
  readonly kind = 'unavailable';

  constructor() {
    super(
      'Hệ thống chưa cấu hình InspectionRegistry (INSPECTION_REGISTRY_ADDRESS) hoặc khoá ký giấy phép nên chưa kiểm định được.',
    );
  }
}

export class InspectorRequiredError extends DomainError {
  readonly code = 'INSPECTOR_REQUIRED';
  readonly kind = 'forbidden';

  constructor() {
    super(
      'Chỉ người đại diện của đơn vị kiểm định đã được duyệt mới xử lý yêu cầu kiểm định được.',
    );
  }
}

export class InspectionWalletRequiredError extends DomainError {
  readonly code = 'PERSONAL_WALLET_REQUIRED';
  readonly kind = 'conflict';

  constructor() {
    super(
      'Liên kết ví MetaMask ở trang Tài khoản trước. Ví cá nhân của bạn ký giao dịch ghi kết quả kiểm định.',
    );
  }
}

export class InspectionProductNotFoundError extends DomainError {
  readonly code = 'PRODUCT_NOT_FOUND';
  readonly kind = 'not_found';

  constructor() {
    super('Không tìm thấy sản phẩm.');
  }
}

export class InspectionProductInactiveError extends DomainError {
  readonly code = 'INSPECTION_PRODUCT_INACTIVE';
  readonly kind = 'conflict';

  constructor() {
    super('Sản phẩm đã thu hồi, báo mất hoặc ngừng sử dụng nên không kiểm định được.');
  }
}

export class InspectorNotFoundError extends DomainError {
  readonly code = 'INSPECTOR_NOT_FOUND';
  readonly kind = 'invalid';

  constructor() {
    super('Đơn vị kiểm định không tồn tại hoặc chưa được duyệt. Chọn đơn vị khác.');
  }
}

export class InspectionRequestPendingError extends DomainError {
  readonly code = 'INSPECTION_REQUEST_PENDING';
  readonly kind = 'conflict';

  constructor() {
    super(
      'Sản phẩm đang có một yêu cầu kiểm định chờ kết quả. Chờ đơn vị kiểm định xử lý, hoặc người gửi huỷ yêu cầu đó.',
    );
  }
}

export class InspectionRequestNotFoundError extends DomainError {
  readonly code = 'INSPECTION_REQUEST_NOT_FOUND';
  readonly kind = 'not_found';

  constructor() {
    super('Không tìm thấy yêu cầu kiểm định.');
  }
}

export class InspectionRequestStateError extends DomainError {
  readonly code = 'INSPECTION_REQUEST_STATE';
  readonly kind = 'conflict';
}

export class InspectionRequesterChangedError extends DomainError {
  readonly code = 'INSPECTION_REQUESTER_CHANGED';
  readonly kind = 'conflict';

  constructor() {
    super(
      'Người gửi không còn quyền yêu cầu kiểm định sản phẩm này (sản phẩm đã đổi chủ, thu hồi hoặc báo mất). Từ chối yêu cầu kèm lý do.',
    );
  }
}

export class InspectionReportNotFoundError extends DomainError {
  readonly code = 'INSPECTION_REPORT_NOT_FOUND';
  readonly kind = 'not_found';

  constructor() {
    super('Lần kiểm định này không có file biên bản.');
  }
}

export class InspectionRequesterNotAuthorizedError extends DomainError {
  readonly code = 'ORGANIZATION_NOT_AUTHORIZED';
  readonly kind = 'forbidden';

  constructor() {
    super('Doanh nghiệp chưa được duyệt hoặc đã bị khoá nên không gửi yêu cầu kiểm định được.');
  }
}
