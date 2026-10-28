import { DomainError } from '../../../common/domain/domain-error.js';

export class EmailAlreadyRegisteredError extends DomainError {
  readonly code = 'EMAIL_TAKEN';
  readonly kind = 'conflict';

  constructor() {
    super('Email này đã được dùng để đăng ký tài khoản khác.');
  }
}

export class WeakPasswordError extends DomainError {
  readonly code = 'WEAK_PASSWORD';
  readonly kind = 'invalid';
}

/** Không nói rõ sai email hay sai mật khẩu để tránh dò email đã đăng ký. */
export class InvalidCredentialsError extends DomainError {
  readonly code = 'INVALID_CREDENTIALS';
  readonly kind = 'unauthenticated';

  constructor() {
    super('Email hoặc mật khẩu không đúng.');
  }
}

export class AccountNotActiveError extends DomainError {
  readonly code = 'ACCOUNT_LOCKED';
  readonly kind = 'forbidden';

  constructor() {
    super('Tài khoản đã bị khoá. Liên hệ quản trị viên để được hỗ trợ.');
  }
}

export class SessionRequiredError extends DomainError {
  readonly code = 'SESSION_REQUIRED';
  readonly kind = 'unauthenticated';

  constructor() {
    super('Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Hãy đăng nhập lại.');
  }
}

export class PasswordConfirmationError extends DomainError {
  readonly code = 'PASSWORD_CONFIRMATION_FAILED';
  readonly kind = 'forbidden';

  constructor() {
    super('Mật khẩu xác nhận không đúng.');
  }
}

export class WalletChallengeInvalidError extends DomainError {
  readonly code = 'CHALLENGE_INVALID';
  readonly kind = 'invalid';

  constructor() {
    super('Yêu cầu ký đã hết hạn hoặc không hợp lệ. Hãy bắt đầu liên kết ví lại.');
  }
}

export class WalletSignatureMismatchError extends DomainError {
  readonly code = 'SIGNATURE_MISMATCH';
  readonly kind = 'invalid';

  constructor() {
    super('Chữ ký không khớp với ví đang liên kết.');
  }
}

export class WalletAlreadyLinkedError extends DomainError {
  readonly code = 'WALLET_ALREADY_LINKED';
  readonly kind = 'conflict';

  constructor() {
    super('Tài khoản đã có ví cá nhân. Dùng chức năng đổi ví để thay ví khác.');
  }
}

export class NoActiveWalletError extends DomainError {
  readonly code = 'NO_ACTIVE_WALLET';
  readonly kind = 'conflict';

  constructor() {
    super('Tài khoản chưa có ví cá nhân để đổi. Hãy liên kết ví trước.');
  }
}

export class SameWalletError extends DomainError {
  readonly code = 'SAME_WALLET';
  readonly kind = 'invalid';

  constructor() {
    super('Ví mới trùng với ví đang dùng. Chọn tài khoản khác trong MetaMask.');
  }
}

export class WalletAlreadyUsedError extends DomainError {
  readonly code = 'WALLET_ALREADY_USED';
  readonly kind = 'conflict';

  constructor() {
    super('Ví này đã từng được liên kết trong hệ thống. Mỗi ví chỉ được dùng một lần.');
  }
}

export class WalletLinkInProgressError extends DomainError {
  readonly code = 'WALLET_LINK_IN_PROGRESS';
  readonly kind = 'conflict';

  constructor() {
    super(
      'Giao dịch liên kết ví trước đó đang chờ xác nhận trên blockchain. Hãy đợi trong giây lát.',
    );
  }
}

export class WalletLinkNotFoundError extends DomainError {
  readonly code = 'WALLET_LINK_NOT_FOUND';
  readonly kind = 'not_found';

  constructor() {
    super('Không tìm thấy yêu cầu liên kết ví đang chờ.');
  }
}

export class ChainOutOfSyncError extends DomainError {
  readonly code = 'CHAIN_OUT_OF_SYNC';
  readonly kind = 'conflict';

  constructor() {
    super('Dữ liệu ví trên blockchain đang được đồng bộ về hệ thống. Thử lại sau ít phút.');
  }
}

export class IdentityChainNotConfiguredError extends DomainError {
  readonly code = 'CHAIN_NOT_CONFIGURED';
  readonly kind = 'unavailable';

  constructor() {
    super('Hệ thống chưa cấu hình PartyRegistry nên chưa liên kết ví được.');
  }
}

export class InvalidWalletAddressError extends DomainError {
  readonly code = 'INVALID_WALLET_ADDRESS';
  readonly kind = 'invalid';

  constructor() {
    super('Địa chỉ ví không hợp lệ hoặc sai checksum.');
  }
}

export class BlockchainUnavailableError extends DomainError {
  readonly code = 'CHAIN_UNAVAILABLE';
  readonly kind = 'unavailable';

  constructor() {
    super('Không kết nối được blockchain để kiểm tra ví. Thử lại sau.');
  }
}
