import { DomainError } from '../../../common/domain/domain-error.js';

export class TransactionNotFoundError extends DomainError {
  readonly code = 'TX_NOT_FOUND';
  readonly kind = 'not_found';

  constructor(txHash: string) {
    super('Mạng chưa ghi nhận giao dịch này. Đợi vài giây rồi thử lại.', { txHash });
  }
}

export class TransactionMismatchError extends DomainError {
  readonly code = 'TX_MISMATCH';
  readonly kind = 'invalid';

  constructor(reason: string, details: Record<string, unknown>) {
    super(`Giao dịch không khớp yêu cầu: ${reason}.`, details);
  }
}

export class ContractNotConfiguredError extends DomainError {
  readonly code = 'CONTRACT_NOT_CONFIGURED';
  readonly kind = 'unavailable';

  constructor(contractName: string) {
    super(`Chưa cấu hình địa chỉ contract ${contractName} trên API.`);
  }
}
