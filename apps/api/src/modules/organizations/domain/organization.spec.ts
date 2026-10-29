import { canEditApplication, decisionAllowed, normalizeProfile, stageOf } from './organization.js';

describe('Giai đoạn đơn đăng ký doanh nghiệp', () => {
  it('PENDING chưa có applied_at là bản nháp chưa nộp phí', () => {
    expect(stageOf({ authStatus: 'PENDING', appliedAt: null })).toBe('DRAFT');
    expect(stageOf({ authStatus: 'PENDING', appliedAt: new Date() })).toBe('PENDING');
    expect(stageOf({ authStatus: 'REJECTED', appliedAt: new Date() })).toBe('REJECTED');
  });

  it('chỉ sửa được bản nháp và đơn bị từ chối', () => {
    expect(canEditApplication('DRAFT')).toBe(true);
    expect(canEditApplication('REJECTED')).toBe(true);
    expect(canEditApplication('PENDING')).toBe(false);
    expect(canEditApplication('AUTHORIZED')).toBe(false);
    expect(canEditApplication('DISABLED')).toBe(false);
  });

  it('từ chối chỉ áp dụng cho đơn chờ duyệt, khoá chỉ cho doanh nghiệp đã duyệt', () => {
    expect(decisionAllowed('PENDING', 'REJECT')).toBe(true);
    expect(decisionAllowed('AUTHORIZED', 'REJECT')).toBe(false);
    expect(decisionAllowed('AUTHORIZED', 'DISABLE')).toBe(true);
    expect(decisionAllowed('PENDING', 'DISABLE')).toBe(false);
  });

  it('chuẩn hoá hồ sơ trước khi băm: khoảng trắng, email, số điện thoại', () => {
    expect(
      normalizeProfile({
        name: '  Công ty   ABC ',
        taxCode: ' 0312345678-001 ',
        orgType: 'RETAILER',
        contactEmail: ' Info@ABC.VN ',
        contactPhone: '(028) 3812.3456',
        address: '   ',
      }),
    ).toEqual({
      name: 'Công ty ABC',
      taxCode: '0312345678-001',
      orgType: 'RETAILER',
      contactEmail: 'info@abc.vn',
      contactPhone: '02838123456',
      address: null,
    });
  });
});
