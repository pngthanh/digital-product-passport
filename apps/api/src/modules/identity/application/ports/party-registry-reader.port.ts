/** Hàm view của PartyRegistry, dùng để kiểm tra trước khi cấp giấy phép. */
export interface PartyRegistryReader {
  isWalletUsed(address: string): Promise<boolean>;
  /** Ví hiện tại (chữ thường) của Party; `null` nếu Party chưa đăng ký on-chain. */
  walletOf(chainPartyId: string): Promise<string | null>;
}

export const PARTY_REGISTRY_READER = Symbol('PARTY_REGISTRY_READER');
