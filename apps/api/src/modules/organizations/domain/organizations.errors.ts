import type { OrganizationStage } from '@dpp/shared';
import { DomainError } from '../../../common/domain/domain-error.js';

export class PersonalWalletRequiredError extends DomainError {
  readonly code = 'PERSONAL_WALLET_REQUIRED';
  readonly kind = 'conflict';

  constructor() {
    super(
      'Liên kết ví MetaMask ở trang Tài khoản trước. Mọi giao dịch của doanh nghiệp đều do ví cá nhân của bạn ký và trả phí.',
    );
  }
}

const LOCKED_MESSAGES: Partial<Record<OrganizationStage, string>> = {
  PENDING: 'Đơn đang chờ quản trị viên duyệt, chưa sửa được.',
  AUTHORIZED: 'Doanh nghiệp đã được duyệt.',
  DISABLED: 'Doanh nghiệp đã bị khoá.',
};

export class ApplicationLockedError extends DomainError {
  readonly code = 'ORGANIZATION_APPLICATION_LOCKED';
  readonly kind = 'conflict';

  constructor(stage: OrganizationStage) {
    super(LOCKED_MESSAGES[stage] ?? 'Không sửa được đơn ở trạng thái hiện tại.', { stage });
  }
}

export class TaxCodeTakenError extends DomainError {
  readonly code = 'TAX_CODE_TAKEN';
  readonly kind = 'conflict';

  constructor() {
    super('Mã số thuế này đã được một doanh nghiệp khác đăng ký.');
  }
}

export class OrganizationNotFoundError extends DomainError {
  readonly code = 'ORGANIZATION_NOT_FOUND';
  readonly kind = 'not_found';

  constructor() {
    super('Không tìm thấy doanh nghiệp.');
  }
}

export class DecisionNotAllowedError extends DomainError {
  readonly code = 'DECISION_NOT_ALLOWED';
  readonly kind = 'conflict';

  constructor(decision: 'REJECT' | 'DISABLE', stage: OrganizationStage) {
    super(
      decision === 'REJECT'
        ? 'Chỉ từ chối được đơn đang chờ duyệt.'
        : 'Chỉ khoá được doanh nghiệp đã được duyệt.',
      { decision, stage },
    );
  }
}

export class OrganizationChainNotConfiguredError extends DomainError {
  readonly code = 'ORGANIZATION_CHAIN_NOT_CONFIGURED';
  readonly kind = 'unavailable';

  constructor() {
    super(
      'API chưa cấu hình PartyRegistry (PARTY_REGISTRY_ADDRESS, REGISTRAR_SIGNER_PRIVATE_KEY).',
    );
  }
}

export class ChainReadFailedError extends DomainError {
  readonly code = 'CHAIN_UNAVAILABLE';
  readonly kind = 'unavailable';

  constructor() {
    super('Không đọc được dữ liệu từ blockchain. Thử lại sau ít phút.');
  }
}
