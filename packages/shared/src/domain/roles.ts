import { id, ZeroHash } from 'ethers';
import { OrgType } from './enums.js';

/*
 * Định danh role trên contract. Quy ước giống OpenZeppelin AccessControl:
 * role = keccak256("<TÊN>_ROLE"), riêng DEFAULT_ADMIN_ROLE = 0x00…00.
 * Khớp với `packages/contracts/contracts/shared/DppRoles.sol`.
 */
export const DEFAULT_ADMIN_ROLE = ZeroHash;
/** Khoá ký giấy phép gắn ví của backend (chỉ ký EIP-712, không gửi giao dịch). */
export const REGISTRAR_ROLE = id('REGISTRAR_ROLE');
export const MANUFACTURER_ROLE = id('MANUFACTURER_ROLE');
export const RETAILER_ROLE = id('RETAILER_ROLE');
export const SERVICE_CENTER_ROLE = id('SERVICE_CENTER_ROLE');
export const INSPECTOR_ROLE = id('INSPECTOR_ROLE');
export const PRODUCT_CONTRACT_ROLE = id('PRODUCT_CONTRACT_ROLE');
export const TRANSFER_CONTRACT_ROLE = id('TRANSFER_CONTRACT_ROLE');

/** Role nghiệp vụ tương ứng với từng loại tổ chức. */
export const ORG_TYPE_ROLE: Readonly<Record<OrgType, string>> = {
  [OrgType.MANUFACTURER]: MANUFACTURER_ROLE,
  [OrgType.RETAILER]: RETAILER_ROLE,
  [OrgType.SERVICE_CENTER]: SERVICE_CENTER_ROLE,
  [OrgType.INSPECTOR]: INSPECTOR_ROLE,
};

/** Loại tổ chức từ role id on-chain; `null` nếu không phải role nghiệp vụ của tổ chức. */
export function orgTypeFromRole(role: string): OrgType | null {
  const normalized = role.toLowerCase();
  const match = Object.entries(ORG_TYPE_ROLE).find(([, value]) => value === normalized);
  return match ? (match[0] as OrgType) : null;
}
