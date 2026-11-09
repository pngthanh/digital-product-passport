import type { ServiceTicketOpening } from '@dpp/shared';

/** ServiceTicketManager: ký giấy phép mở phiếu bằng khoá registrar. */
export interface ServiceTicketChain {
  readonly chainId: number;
  /** Chữ thường; `null` khi chưa cấu hình. */
  readonly contractAddress: string | null;
  signOpening(opening: ServiceTicketOpening): Promise<string>;
}

export const SERVICE_TICKET_CHAIN = Symbol('SERVICE_TICKET_CHAIN');
