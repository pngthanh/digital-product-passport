import { describe, expect, it } from 'vitest';
import {
  CONTACT_PHONE_PATTERN,
  type OrganizationProfile,
  organizationProfileHash,
  statusReasonHash,
  TAX_CODE_PATTERN,
} from './organization-profile.js';

const PROFILE: OrganizationProfile = {
  name: 'ABC Electronics',
  taxCode: '0312345678',
  orgType: 'MANUFACTURER',
  contactEmail: 'lien.he@abc.vn',
  contactPhone: null,
  address: null,
};

describe('Hồ sơ tổ chức', () => {
  it('hash cố định theo nội dung, đổi bất kỳ trường nào thì hash đổi', () => {
    const hash = organizationProfileHash(PROFILE);

    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(organizationProfileHash({ ...PROFILE })).toBe(hash);
    expect(organizationProfileHash({ ...PROFILE, contactPhone: '0901234567' })).not.toBe(hash);
    expect(organizationProfileHash({ ...PROFILE, orgType: 'RETAILER' })).not.toBe(hash);
  });

  it('mã số thuế 10 số hoặc chi nhánh -xxx; số điện thoại 8–15 chữ số', () => {
    expect(TAX_CODE_PATTERN.test('0312345678')).toBe(true);
    expect(TAX_CODE_PATTERN.test('0312345678-001')).toBe(true);
    expect(TAX_CODE_PATTERN.test('031234567')).toBe(false);
    expect(CONTACT_PHONE_PATTERN.test('+842838123456')).toBe(true);
    expect(CONTACT_PHONE_PATTERN.test('12345')).toBe(false);
  });

  it('hash lý do khác nhau với nội dung khác nhau', () => {
    expect(statusReasonHash('A')).not.toBe(statusReasonHash('B'));
  });
});
