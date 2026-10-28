import type { WalletLinkPurpose } from '@dpp/shared';
import {
  NoActiveWalletError,
  SameWalletError,
  WalletAlreadyLinkedError,
  WalletLinkInProgressError,
} from './identity.errors.js';

/** Ví cá nhân hiện có của một Party người dùng, địa chỉ chữ thường. */
export interface PersonalWalletState {
  active: { id: string; address: string } | null;
  pending: { id: string; address: string; inFlight: boolean } | null;
}

export interface WalletBindingPlan {
  /** Ví bị thay thế; `null` khi liên kết lần đầu (registerUser). */
  previousAddress: string | null;
  /** Dòng PENDING cùng địa chỉ được dùng lại để cấp giấy phép mới. */
  reusePendingId: string | null;
  /** Dòng PENDING cũ khác địa chỉ, không còn giao dịch nào, cần bỏ trước khi tạo dòng mới. */
  discardPendingId: string | null;
}

/**
 * Quy tắc ACC-03/04: LINK chỉ khi chưa có ví, ROTATE chỉ khi đã có ví và ví mới khác ví cũ;
 * không mở yêu cầu mới khi giao dịch của yêu cầu trước còn chờ xác nhận on-chain.
 */
export function planWalletBinding(
  state: PersonalWalletState,
  address: string,
  purpose: WalletLinkPurpose,
): WalletBindingPlan {
  if (purpose === 'LINK' && state.active) {
    throw new WalletAlreadyLinkedError();
  }
  if (purpose === 'ROTATE' && !state.active) {
    throw new NoActiveWalletError();
  }
  if (state.active?.address === address) {
    throw new SameWalletError();
  }
  if (state.pending?.inFlight) {
    throw new WalletLinkInProgressError();
  }
  const samePending = state.pending?.address === address;
  return {
    previousAddress: state.active?.address ?? null,
    reusePendingId: samePending ? (state.pending?.id ?? null) : null,
    discardPendingId: state.pending && !samePending ? state.pending.id : null,
  };
}
