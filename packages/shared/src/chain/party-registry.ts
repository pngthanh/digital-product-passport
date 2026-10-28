import { type TypedDataDomain, TypedDataEncoder, type TypedDataField, ZeroAddress } from 'ethers';

/*
 * Giấy phép gắn ví (EIP-712) mà backend ký để ví người dùng tự gửi giao dịch lên PartyRegistry.
 * Phải khớp `WALLET_BINDING_TYPEHASH` và tên/phiên bản EIP-712 trong `PartyRegistry.sol`.
 */

export const PARTY_REGISTRY_CONTRACT_NAME = 'PartyRegistry';

export const PARTY_REGISTRY_EIP712_NAME = 'DPP PartyRegistry';

export const PARTY_REGISTRY_EIP712_VERSION = '1';

export const WALLET_BINDING_PRIMARY_TYPE = 'WalletBinding';

export const WALLET_BINDING_TYPES: Record<string, TypedDataField[]> = {
  [WALLET_BINDING_PRIMARY_TYPE]: [
    { name: 'partyId', type: 'bytes32' },
    { name: 'wallet', type: 'address' },
    { name: 'previousWallet', type: 'address' },
    { name: 'deadline', type: 'uint256' },
  ],
};

/** Hàm ghi của PartyRegistry mà ví người dùng gọi với giấy phép. */
export type PartyRegistryMethod = 'registerUser' | 'rotateWallet';

/** Nội dung giấy phép: ví `wallet` được gắn vào `partyId`, thay cho `previousWallet` nếu là xoay ví. */
export interface WalletBinding {
  partyId: string;
  wallet: string;
  /** `ZeroAddress` khi đăng ký lần đầu (registerUser). */
  previousWallet: string;
  /** Hạn dùng giấy phép, tính bằng giây Unix, so với `block.timestamp`. */
  deadline: bigint;
}

export function partyRegistryDomain(chainId: number, verifyingContract: string): TypedDataDomain {
  return {
    name: PARTY_REGISTRY_EIP712_NAME,
    version: PARTY_REGISTRY_EIP712_VERSION,
    chainId,
    verifyingContract,
  };
}

/** Digest EIP-712 của giấy phép, bằng đúng `walletBindingDigest()` của contract. */
export function walletBindingDigest(
  chainId: number,
  verifyingContract: string,
  binding: WalletBinding,
): string {
  return TypedDataEncoder.hash(
    partyRegistryDomain(chainId, verifyingContract),
    WALLET_BINDING_TYPES,
    { ...binding },
  );
}

/** Đăng ký lần đầu khi chưa có ví trước đó, ngược lại là xoay ví. */
export function bindingMethod(binding: Pick<WalletBinding, 'previousWallet'>): PartyRegistryMethod {
  return binding.previousWallet === ZeroAddress ? 'registerUser' : 'rotateWallet';
}
