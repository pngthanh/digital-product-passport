import { canSignIn, isSessionValid } from './user-account.js';

describe('Phiên đăng nhập', () => {
  it('chỉ tài khoản ACTIVE được đăng nhập', () => {
    expect(canSignIn({ status: 'ACTIVE' })).toBe(true);
    expect(canSignIn({ status: 'LOCKED' })).toBe(false);
    expect(canSignIn({ status: 'DELETED' })).toBe(false);
  });

  it('token mang session_version cũ bị từ chối sau khi đăng xuất', () => {
    expect(isSessionValid({ status: 'ACTIVE', sessionVersion: 3 }, 3)).toBe(true);
    expect(isSessionValid({ status: 'ACTIVE', sessionVersion: 4 }, 3)).toBe(false);
  });

  it('tài khoản bị khoá thì mọi phiên đều mất hiệu lực', () => {
    expect(isSessionValid({ status: 'LOCKED', sessionVersion: 3 }, 3)).toBe(false);
  });
});
