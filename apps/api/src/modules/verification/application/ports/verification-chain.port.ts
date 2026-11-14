import type { AuthStatus, VerificationContracts } from '@dpp/shared';
import type { ChainPassport, WarrantyFacts } from '../../domain/verification.js';

/** Đọc hàm view của contract tại một block cụ thể (eth_call với blockTag). */
export interface VerificationChain {
  /** Địa chỉ contract đang cấu hình; `null` khi chưa có ProductPassport hoặc PartyRegistry. */
  contracts(): VerificationContracts | null;
  readPassport(chainProductId: string, block: bigint): Promise<ChainPassport>;
  /** `null` là sản phẩm chưa kích hoạt bảo hành; ném lỗi khi chưa cấu hình WarrantyManager. */
  readWarranty(chainProductId: string, block: bigint): Promise<WarrantyFacts | null>;
  /** `null` là PartyRegistry không có tổ chức này. */
  readOrganizationStatus(chainPartyId: string, block: bigint): Promise<AuthStatus | null>;
}

export const VERIFICATION_CHAIN = Symbol('VERIFICATION_CHAIN');
