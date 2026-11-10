import type { TransferAuthorization } from '@dpp/shared';

/** OwnershipTransfer: ký giấy phép tạo yêu cầu bằng khoá registrar. */
export interface TransferChain {
  readonly chainId: number;
  /** Chữ thường; `null` khi chưa cấu hình. */
  readonly contractAddress: string | null;
  signAuthorization(authorization: TransferAuthorization): Promise<string>;
}

export const TRANSFER_CHAIN = Symbol('TRANSFER_CHAIN');
