import {
  id,
  type TypedDataDomain,
  TypedDataEncoder,
  type TypedDataField,
  ZeroAddress,
} from 'ethers';
import { FeeAction } from '../domain/enums.js';

/*
 * Giấy phép (EIP-712) mà backend ký để ví người dùng tự gửi giao dịch lên PartyRegistry.
 * Phải khớp các TYPEHASH và tên/phiên bản EIP-712 trong `PartyRegistry.sol`.
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

/** Hàm gắn ví mà ví người dùng gọi với giấy phép WalletBinding. */
export type WalletLinkMethod = 'registerUser' | 'rotateWallet';

/** Hàm của tổ chức: người đại diện nộp đơn, rút phí hoàn. */
export type OrganizationMethod = 'applyOrganization' | 'withdrawRefund';

/** Hàm chỉ ví Admin (DEFAULT_ADMIN_ROLE) gọi được. */
export type PartyRegistryAdminMethod =
  'approveOrganization' | 'rejectOrganization' | 'disableOrganization' | 'setFee' | 'setTreasury';

export type PartyRegistryMethod = WalletLinkMethod | OrganizationMethod | PartyRegistryAdminMethod;

export const ORGANIZATION_APPLICATION_PRIMARY_TYPE = 'OrganizationApplication';

export const ORGANIZATION_APPLICATION_TYPES: Record<string, TypedDataField[]> = {
  [ORGANIZATION_APPLICATION_PRIMARY_TYPE]: [
    { name: 'partyId', type: 'bytes32' },
    { name: 'representativeId', type: 'bytes32' },
    { name: 'role', type: 'bytes32' },
    { name: 'profileHash', type: 'bytes32' },
    { name: 'deadline', type: 'uint256' },
  ],
};

/** Giấy phép nộp đơn: người đại diện `representativeId` nộp hồ sơ `profileHash` cho tổ chức `partyId`. */
export interface OrganizationApplication {
  partyId: string;
  representativeId: string;
  role: string;
  profileHash: string;
  deadline: bigint;
}

/** Mã thao tác thu phí trên contract: keccak256 của tên thao tác. */
export const FEE_ACTION_IDS: Readonly<Record<FeeAction, string>> = {
  [FeeAction.ORG_REGISTRATION]: id(FeeAction.ORG_REGISTRATION),
};

/** Tên thao tác từ mã on-chain; `null` nếu contract dùng mã chưa biết. */
export function feeActionFromId(actionId: string): FeeAction | null {
  const normalized = actionId.toLowerCase();
  const match = Object.entries(FEE_ACTION_IDS).find(([, value]) => value === normalized);
  return match ? (match[0] as FeeAction) : null;
}

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

/** Digest EIP-712 của giấy phép nộp đơn, bằng đúng `organizationApplicationDigest()` của contract. */
export function organizationApplicationDigest(
  chainId: number,
  verifyingContract: string,
  application: OrganizationApplication,
): string {
  return TypedDataEncoder.hash(
    partyRegistryDomain(chainId, verifyingContract),
    ORGANIZATION_APPLICATION_TYPES,
    { ...application },
  );
}

/** Đăng ký lần đầu khi chưa có ví trước đó, ngược lại là xoay ví. */
export function bindingMethod(binding: Pick<WalletBinding, 'previousWallet'>): WalletLinkMethod {
  return binding.previousWallet === ZeroAddress ? 'registerUser' : 'rotateWallet';
}
