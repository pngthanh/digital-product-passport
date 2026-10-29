import { DomainError } from '../../../common/domain/domain-error.js';

export class ProductChainNotConfiguredError extends DomainError {
  readonly code = 'PRODUCT_CHAIN_NOT_CONFIGURED';
  readonly kind = 'unavailable';

  constructor() {
    super(
      'Hệ thống chưa cấu hình ProductPassport (PRODUCT_PASSPORT_ADDRESS) hoặc khoá ký giấy phép nên chưa đăng ký được sản phẩm.',
    );
  }
}

export class ManufacturerRequiredError extends DomainError {
  readonly code = 'MANUFACTURER_REQUIRED';
  readonly kind = 'forbidden';

  constructor() {
    super('Chỉ người đại diện của nhà sản xuất đã được duyệt mới đăng ký được sản phẩm.');
  }
}

export class ProductWalletRequiredError extends DomainError {
  readonly code = 'PERSONAL_WALLET_REQUIRED';
  readonly kind = 'conflict';

  constructor() {
    super(
      'Liên kết ví MetaMask ở trang Tài khoản trước. Ví cá nhân của bạn ký giao dịch đăng ký sản phẩm.',
    );
  }
}

export class DuplicateSerialInBatchError extends DomainError {
  readonly code = 'DUPLICATE_SERIAL_IN_BATCH';
  readonly kind = 'invalid';

  constructor(readonly serials: readonly string[]) {
    super(`Serial bị lặp trong cùng lô: ${serials.join(', ')}.`, { serials });
  }
}

export class SerialTakenError extends DomainError {
  readonly code = 'SERIAL_TAKEN';
  readonly kind = 'conflict';

  constructor(readonly serials: readonly string[]) {
    super(`Doanh nghiệp đã có sản phẩm (hoặc bản nháp) với serial: ${serials.join(', ')}.`, {
      serials,
    });
  }
}

export class ProductNotFoundError extends DomainError {
  readonly code = 'PRODUCT_NOT_FOUND';
  readonly kind = 'not_found';

  constructor() {
    super('Không tìm thấy sản phẩm.');
  }
}

export class ProductAlreadyOnChainError extends DomainError {
  readonly code = 'PRODUCT_ALREADY_ON_CHAIN';
  readonly kind = 'conflict';

  constructor(readonly serials: readonly string[]) {
    super(
      `Sản phẩm đã được ghi lên blockchain, hệ thống đang đồng bộ: ${serials.join(', ')}. Tải lại trang sau ít giây.`,
      { serials },
    );
  }
}

export class ProductChainReadFailedError extends DomainError {
  readonly code = 'PRODUCT_CHAIN_READ_FAILED';
  readonly kind = 'unavailable';

  constructor() {
    super('Không đọc được ProductPassport qua RPC. Thử lại sau ít phút.');
  }
}

export class RetailerRequiredError extends DomainError {
  readonly code = 'RETAILER_REQUIRED';
  readonly kind = 'forbidden';

  constructor() {
    super('Chỉ người đại diện của nhà bán lẻ đã được duyệt mới nhận và bán hàng được.');
  }
}

export class ProductNotInStockError extends DomainError {
  readonly code = 'PRODUCT_NOT_IN_STOCK';
  readonly kind = 'conflict';

  constructor() {
    super(
      'Sản phẩm không còn ở cửa hàng của bạn (chưa nhận hàng, đã bán hoặc hệ thống đang đồng bộ). Tải lại trang.',
    );
  }
}

export class BuyerNotFoundError extends DomainError {
  readonly code = 'BUYER_NOT_FOUND';
  readonly kind = 'not_found';

  constructor() {
    super(
      'Không có tài khoản với email này. Người mua tạo tài khoản ở trang Đăng ký (chưa cần ví MetaMask) rồi thử lại.',
    );
  }
}
