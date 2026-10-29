/** Hàm view của PartyRegistry: kiểm tra trước khi cấp giấy phép và đối soát dữ liệu chiếu. */
export interface PartyRegistryReader {
  isWalletUsed(address: string): Promise<boolean>;
  /** Ví (chữ thường) của Party tại `atBlock` (mặc định block mới nhất); `null` nếu chưa đăng ký. */
  walletOf(chainPartyId: string, atBlock?: bigint): Promise<string | null>;
}

export const PARTY_REGISTRY_READER = Symbol('PARTY_REGISTRY_READER');
