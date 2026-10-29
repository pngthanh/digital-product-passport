import { isError } from 'ethers';
import { ApiError } from '@/lib/api-error';

/** Lỗi trong luồng giao dịch bằng ví mà người dùng tự xử lý được (thiếu MetaMask, thiếu MON…). */
export class WalletFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalletFlowError';
  }
}

/** Thông báo cho custom error của PartyRegistry, ProductPassport (khi ước lượng gas hoặc bị revert). */
const REVERT_MESSAGES: Readonly<Record<string, string>> = {
  WalletAlreadyUsed: 'Ví này đã từng được liên kết trong hệ thống. Hãy chọn ví khác.',
  AuthorizationExpired: 'Giấy phép đã hết hạn. Bấm làm lại để nhận giấy phép mới.',
  InvalidAuthorization: 'Giấy phép không khớp với ví đang chọn. Kiểm tra lại tài khoản MetaMask.',
  PartyAlreadyRegistered:
    'Tài khoản đã có ví trên blockchain và đang được đồng bộ. Tải lại trang sau ít phút.',
  StalePreviousWallet: 'Ví hiện tại trên blockchain đã thay đổi. Tải lại trang rồi thử lại.',
  PartyNotRegistered: 'Tài khoản chưa có ví trên blockchain. Hãy liên kết ví trước.',
  WalletNotLinked: 'Ví này chưa liên kết với tài khoản nào. Liên kết ví ở trang Tài khoản trước.',
  IncorrectFeeAmount: 'Phí đăng ký vừa được thay đổi. Tải lại trang rồi nộp lại.',
  RepresentativeHasOrganization: 'Tài khoản đã đại diện cho một doanh nghiệp khác trên blockchain.',
  NotRepresentative: 'Ví đang chọn không phải ví của người đại diện doanh nghiệp.',
  InvalidOrganizationStatus:
    'Trạng thái doanh nghiệp vừa thay đổi. Tải lại trang để xem trạng thái mới.',
  NothingToRefund: 'Không còn khoản phí nào để rút.',
  UnknownOrganizationRole: 'Loại doanh nghiệp không hợp lệ.',
  AccessControlUnauthorizedAccount:
    'Ví đang chọn không có quyền Admin trên PartyRegistry. Dùng đúng ví đã deploy contract.',
  NotAuthorizedManufacturer:
    'Ví đang chọn không đại diện nhà sản xuất đã được duyệt. Kiểm tra ví MetaMask và trạng thái doanh nghiệp.',
  IssuerMismatch:
    'Giấy phép cấp cho nhà sản xuất khác với ví đang chọn. Tải lại trang rồi thử lại.',
  ProductAlreadyRegistered:
    'Có sản phẩm đã được ghi lên blockchain trước đó, hệ thống đang đồng bộ. Tải lại trang sau ít giây.',
  InvalidBatchSize: 'Mỗi giao dịch ghi từ 1 đến 50 sản phẩm.',
  LengthMismatch: 'Giấy phép không hợp lệ. Bắt đầu lại để nhận giấy phép mới.',
  WarrantyTooLong: 'Số tháng bảo hành tối đa 120.',
  ProductNotFound: 'Sản phẩm chưa có trên ProductPassport đang dùng. Tải lại trang.',
  InvalidStateTransition:
    'Trạng thái sản phẩm vừa thay đổi (đã gửi, đã nhận hoặc đã bán). Tải lại trang để xem trạng thái mới.',
  NotCustodian: 'Doanh nghiệp của bạn không còn giữ sản phẩm này. Tải lại trang.',
  NotPendingCustodian: 'Sản phẩm này không được gửi cho cửa hàng của bạn.',
  RecipientNotRetailer: 'Bên nhận không phải nhà bán lẻ đã được duyệt (có thể vừa bị khoá).',
  NotAuthorizedRetailer:
    'Ví đang chọn không đại diện nhà bán lẻ đã được duyệt. Kiểm tra ví MetaMask và trạng thái doanh nghiệp.',
  InvalidBuyer: 'Không bán được cho tài khoản này. Kiểm tra lại email người mua.',
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
