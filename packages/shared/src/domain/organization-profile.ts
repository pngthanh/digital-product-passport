import { keccak256, toUtf8Bytes } from 'ethers';
import type { OrgType } from './enums.js';

/*
 * Hồ sơ tổ chức (ORG-01) dùng chung cho API (kiểm tra thật) và Web (báo lỗi sớm trên form).
 * Hash của hồ sơ được ghi lên contract trong applyOrganization, nên hai phía phải tính giống hệt.
 */

/** Mã số thuế Việt Nam: 10 chữ số, chi nhánh thêm "-xxx" (khớp CHECK của bảng organizations). */
export const TAX_CODE_PATTERN = /^[0-9]{10}(-[0-9]{3})?$/;

/** Số điện thoại: 8–15 chữ số, cho phép dấu + ở đầu. */
export const CONTACT_PHONE_PATTERN = /^\+?[0-9]{8,15}$/;

export const ORGANIZATION_NAME_MAX_LENGTH = 255;
export const ORGANIZATION_ADDRESS_MAX_LENGTH = 500;
export const STATUS_REASON_MAX_LENGTH = 500;

export interface OrganizationProfile {
  name: string;
  taxCode: string;
  orgType: OrgType;
  /** Chữ thường. */
  contactEmail: string;
  contactPhone: string | null;
  address: string | null;
}

/** keccak256 của JSON hồ sơ với thứ tự khoá cố định; đổi bất kỳ trường nào thì hash đổi. */
export function organizationProfileHash(profile: OrganizationProfile): string {
  const canonical = JSON.stringify({
    version: 1,
    name: profile.name,
    taxCode: profile.taxCode,
    orgType: profile.orgType,
    contactEmail: profile.contactEmail,
    contactPhone: profile.contactPhone,
    address: profile.address,
  });
  return keccak256(toUtf8Bytes(canonical));
}

/** keccak256 của lý do từ chối/khoá; contract chỉ lưu hash, nội dung nằm ở CSDL. */
export function statusReasonHash(reason: string): string {
  return keccak256(toUtf8Bytes(reason));
}
