import { makeError } from 'ethers';
import { describe, expect, it } from 'vitest';
import { describeWalletError } from '@/lib/wallet/wallet-errors';
import { organizationFormSchema, reasonSchema } from './organization.schema';

const VALID = {
  name: ' ABC Electronics ',
  taxCode: '0312345678-001',
  orgType: 'RETAILER',
  contactEmail: 'lien.he@abc.vn',
  contactPhone: '028 3812.3456',
  address: '',
};

describe('Form đăng ký doanh nghiệp', () => {
  it('chuẩn hoá tên và số điện thoại giống API', () => {
    expect(organizationFormSchema.parse(VALID)).toMatchObject({
      name: 'ABC Electronics',
      contactPhone: '02838123456',
      address: '',
    });
  });

  it('báo lỗi đúng ô: mã số thuế, email, số điện thoại', () => {
    const result = organizationFormSchema.safeParse({
      ...VALID,
      taxCode: '12345',
      contactEmail: 'khong-hop-le',
      contactPhone: '12',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual([
      'taxCode',
      'contactEmail',
      'contactPhone',
    ]);
  });

  it('lý do từ chối/khoá không được để trống', () => {
    expect(reasonSchema.safeParse('   ').success).toBe(false);
    expect(reasonSchema.parse('  Thiếu giấy phép ')).toBe('Thiếu giấy phép');
  });
});

describe('Thông báo lỗi contract phần doanh nghiệp', () => {
  function revert(name: string) {
    return makeError('revert', 'CALL_EXCEPTION', {
      action: 'estimateGas',
      data: '0x',
      reason: null,
      transaction: { to: null, data: '0x' },
      invocation: null,
      revert: { name, signature: `${name}()`, args: [] },
    });
  }

  it('phí vừa đổi, sai trạng thái, ví không có quyền Admin', () => {
    expect(describeWalletError(revert('IncorrectFeeAmount'))).toContain(
      'Phí đăng ký vừa được thay đổi',
    );
    expect(describeWalletError(revert('InvalidOrganizationStatus'))).toContain('Tải lại trang');
    expect(describeWalletError(revert('AccessControlUnauthorizedAccount'))).toContain(
      'không có quyền Admin',
    );
  });
});
