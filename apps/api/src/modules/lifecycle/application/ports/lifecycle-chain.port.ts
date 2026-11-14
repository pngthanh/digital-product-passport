import type { RecallAuthorization } from '@dpp/shared';

/** ProductLifecycle: ký giấy phép thu hồi bằng khoá registrar. */
export interface LifecycleChain {
  readonly chainId: number;
  /** Chữ thường; `null` khi chưa cấu hình. */
  readonly contractAddress: string | null;
  signRecall(authorization: RecallAuthorization): Promise<string>;
}

export const LIFECYCLE_CHAIN = Symbol('LIFECYCLE_CHAIN');
