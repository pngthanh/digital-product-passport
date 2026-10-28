import { isError } from 'ethers';
import { ApiError } from '@/lib/api-error';

/** Lỗi trong luồng liên kết ví mà người dùng tự xử lý được (thiếu MetaMask, thiếu MON…). */
export class WalletFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalletFlowError';
  }
}

/** Thông báo cho custom error của PartyRegistry (khi ước lượng gas hoặc giao dịch bị revert). */
const REVERT_MESSAGES: Readonly<Record<string, string>> = {
  WalletAlreadyUsed: 'Ví này đã từng được liên kết trong hệ thống. Hãy chọn ví khác.',
  AuthorizationExpired: 'Giấy phép đã hết hạn. Bấm làm lại để nhận giấy phép mới.',
  InvalidAuthorization: 'Giấy phép không khớp với ví đang chọn. Kiểm tra lại tài khoản MetaMask.',
  PartyAlreadyRegistered:
    'Tài khoản đã có ví trên blockchain và đang được đồng bộ. Tải lại trang sau ít phút.',
  StalePreviousWallet: 'Ví hiện tại trên blockchain đã thay đổi. Tải lại trang rồi thử lại.',
  PartyNotRegistered: 'Tài khoản chưa có ví trên blockchain. Hãy liên kết ví trước.',
};

/** Mã lỗi EIP-1193 thường gặp từ MetaMask. */
const PROVIDER_MESSAGES: Readonly<Record<number, string>> = {
  4001: 'Bạn đã từ chối yêu cầu trong MetaMask.',
  4100: 'MetaMask chưa cho phép trang này dùng tài khoản. Mở MetaMask và kết nối lại.',
  [-32002]: 'MetaMask đang có một yêu cầu chờ xử lý. Mở tiện ích MetaMask để tiếp tục.',
};

function providerCode(error: unknown): number | null {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'number'
    ? error.code
    : null;
}

/** Chuyển mọi lỗi của MetaMask, ethers và API thành một câu tiếng Việt dễ hiểu. */
export function describeWalletError(error: unknown): string {
  if (error instanceof WalletFlowError || error instanceof ApiError) {
    return error.message;
  }
  if (isError(error, 'ACTION_REJECTED')) {
    return PROVIDER_MESSAGES[4001] ?? 'Bạn đã từ chối yêu cầu.';
  }
  if (isError(error, 'INSUFFICIENT_FUNDS')) {
    return 'Ví không đủ MON để trả gas. Nhận MON testnet ở faucet rồi thử lại.';
  }
  if (isError(error, 'CALL_EXCEPTION')) {
    const reason = error.revert?.name;
    return (
      (reason && REVERT_MESSAGES[reason]) ??
      'Contract từ chối giao dịch. Bắt đầu lại để thử lần nữa.'
    );
  }
  const code = providerCode(error);
  if (code !== null && PROVIDER_MESSAGES[code]) {
    return PROVIDER_MESSAGES[code];
  }
  return 'Không hoàn tất được thao tác với ví. Thử lại sau ít phút.';
}
