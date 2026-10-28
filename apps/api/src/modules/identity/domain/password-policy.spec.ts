import { findPasswordPolicyViolation } from './password-policy.js';

describe('findPasswordPolicyViolation', () => {
  it('chấp nhận mật khẩu đủ dài, không ép ký tự đặc biệt', () => {
    expect(findPasswordPolicyViolation('mat khau dai du', 'an@example.com')).toBeNull();
  });

  it('từ chối mật khẩu ngắn hơn 8 ký tự', () => {
    expect(findPasswordPolicyViolation('1234567', 'an@example.com')).toMatch(/ít nhất 8/);
  });

  it('đếm theo ký tự Unicode, không theo byte', () => {
    expect(findPasswordPolicyViolation('mậtkhẩuđ', 'an@example.com')).toBeNull();
  });

  it('từ chối mật khẩu quá 128 ký tự', () => {
    expect(findPasswordPolicyViolation('a'.repeat(129), 'an@example.com')).toMatch(/tối đa/);
  });

  it('từ chối mật khẩu trùng email', () => {
    expect(findPasswordPolicyViolation('An@Example.com', 'an@example.com')).toMatch(/trùng/);
  });
});
