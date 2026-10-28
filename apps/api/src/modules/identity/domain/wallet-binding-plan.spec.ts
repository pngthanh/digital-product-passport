import {
  NoActiveWalletError,
  SameWalletError,
  WalletAlreadyLinkedError,
  WalletLinkInProgressError,
} from './identity.errors.js';
import { type PersonalWalletState, planWalletBinding } from './wallet-binding-plan.js';

const OLD = '0x1111111111111111111111111111111111111111';
const NEW = '0x2222222222222222222222222222222222222222';
const OTHER = '0x3333333333333333333333333333333333333333';

const empty: PersonalWalletState = { active: null, pending: null };
const linked: PersonalWalletState = { active: { id: 'w-old', address: OLD }, pending: null };

describe('planWalletBinding', () => {
  it('ACC-03: liên kết lần đầu không có ví trước đó', () => {
    expect(planWalletBinding(empty, NEW, 'LINK')).toEqual({
      previousAddress: null,
      reusePendingId: null,
      discardPendingId: null,
    });
  });

  it('ACC-04: xoay ví ghi lại ví bị thay thế', () => {
    expect(planWalletBinding(linked, NEW, 'ROTATE').previousAddress).toBe(OLD);
  });

  it('không cho LINK khi đã có ví, không cho ROTATE khi chưa có ví', () => {
    expect(() => planWalletBinding(linked, NEW, 'LINK')).toThrow(WalletAlreadyLinkedError);
    expect(() => planWalletBinding(empty, NEW, 'ROTATE')).toThrow(NoActiveWalletError);
  });

  it('không cho xoay sang chính ví đang dùng', () => {
    expect(() => planWalletBinding(linked, OLD, 'ROTATE')).toThrow(SameWalletError);
  });

  it('dùng lại yêu cầu đang chờ cùng địa chỉ, bỏ yêu cầu khác địa chỉ', () => {
    const samePending: PersonalWalletState = {
      active: null,
      pending: { id: 'w-p', address: NEW, inFlight: false },
    };
    const otherPending: PersonalWalletState = {
      active: null,
      pending: { id: 'w-p', address: OTHER, inFlight: false },
    };

    expect(planWalletBinding(samePending, NEW, 'LINK')).toMatchObject({
      reusePendingId: 'w-p',
      discardPendingId: null,
    });
    expect(planWalletBinding(otherPending, NEW, 'LINK')).toMatchObject({
      reusePendingId: null,
      discardPendingId: 'w-p',
    });
  });

  it('chặn yêu cầu mới khi giao dịch trước còn chờ xác nhận', () => {
    const inFlight: PersonalWalletState = {
      active: null,
      pending: { id: 'w-p', address: OTHER, inFlight: true },
    };

    expect(() => planWalletBinding(inFlight, NEW, 'LINK')).toThrow(WalletLinkInProgressError);
  });
});
