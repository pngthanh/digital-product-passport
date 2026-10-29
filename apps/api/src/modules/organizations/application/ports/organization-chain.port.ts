import type { OrganizationApplication } from '@dpp/shared';

/** PartyRegistry đã cấu hình cho phần tổ chức; `null` ở `contract` khi chưa deploy hoặc thiếu khoá. */
export interface OrganizationChain {
  readonly chainId: number;
  readonly contractAddress: string | null;
  /** Ký giấy phép OrganizationApplication bằng khoá REGISTRAR_ROLE. */
  signApplication(application: OrganizationApplication): Promise<string>;
  /** Phí hiện hành đọc thẳng từ contract (wei), để ví gửi kèm đúng số tiền. */
  registrationFee(): Promise<bigint>;
  hasAdminRole(wallet: string): Promise<boolean>;
}

export const ORGANIZATION_CHAIN = Symbol('ORGANIZATION_CHAIN');
