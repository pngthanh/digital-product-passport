import type {
  AlertDecision,
  AlertStatusCode,
  AnomalyRuleCode,
  AnomalySeverityLevel,
  AuditActionCode,
} from '@dpp/shared';
import type { StateLabel } from '@/lib/state-labels';

/** Nhãn tiếng Việt cho mọi mã hành động trong audit_logs (AUD-01). */
export const AUDIT_ACTION_LABELS: Record<AuditActionCode, string> = {
  ACCOUNT_REGISTERED: 'Đăng ký tài khoản',
  SIGNED_IN: 'Đăng nhập',
  SIGN_IN_FAILED: 'Đăng nhập sai',
  SIGNED_OUT: 'Đăng xuất',
  WALLET_LINK_AUTHORIZED: 'Cấp chữ ký liên kết ví',
  WALLET_LINK_SUBMITTED: 'Gửi giao dịch liên kết ví',
  WALLET_ACTIVATED: 'Ví được kích hoạt on-chain',
  WALLET_ROTATED: 'Đổi ví',
  ORG_APPLICATION_AUTHORIZED: 'Cấp chữ ký nộp đơn doanh nghiệp',
  ORG_TRANSACTION_SUBMITTED: 'Doanh nghiệp gửi giao dịch',
  ORG_APPLIED: 'Doanh nghiệp nộp đơn và phí',
  ORG_APPROVED: 'Duyệt doanh nghiệp',
  ORG_REJECTED: 'Từ chối doanh nghiệp',
  ORG_DISABLED: 'Khoá doanh nghiệp',
  ORG_FEE_REFUNDED: 'Doanh nghiệp rút lại phí',
  FEE_POLICY_UPDATED: 'Đổi phí hoặc Treasury',
  ADMIN_DECISION_PREPARED: 'Admin chuẩn bị quyết định',
  ADMIN_TRANSACTION_SUBMITTED: 'Admin gửi giao dịch',
  PRODUCT_REGISTRATION_AUTHORIZED: 'Cấp chữ ký đăng ký sản phẩm',
  PRODUCT_TRANSACTION_SUBMITTED: 'Gửi giao dịch sản phẩm',
  PRODUCT_REGISTERED: 'Sản phẩm lên chain',
  PRODUCT_DRAFT_DELETED: 'Xoá bản nháp sản phẩm',
  PRODUCT_SALE_AUTHORIZED: 'Cấp chữ ký bán hàng',
  PRODUCT_SOLD: 'Bán sản phẩm, kích hoạt bảo hành',
  SERVICE_REQUESTED: 'Chủ gửi yêu cầu bảo hành',
  SERVICE_REQUEST_CANCELLED: 'Chủ huỷ yêu cầu bảo hành',
  SERVICE_OPENING_AUTHORIZED: 'Cấp chữ ký mở phiếu sửa',
  SERVICE_RESULT_PREPARED: 'Trung tâm lưu biên bản sửa',
  SERVICE_TRANSACTION_SUBMITTED: 'Trung tâm gửi giao dịch',
  INSPECTION_REQUESTED: 'Gửi yêu cầu kiểm định',
  INSPECTION_REQUEST_CANCELLED: 'Huỷ yêu cầu kiểm định',
  INSPECTION_REQUEST_DECLINED: 'Từ chối kiểm định',
  INSPECTION_RESULT_PREPARED: 'Lưu biên bản kiểm định',
  INSPECTION_TRANSACTION_SUBMITTED: 'Đơn vị kiểm định gửi giao dịch',
  TRANSFER_AUTHORIZED: 'Cấp chữ ký chuyển nhượng',
  TRANSFER_TRANSACTION_SUBMITTED: 'Gửi giao dịch chuyển nhượng',
  RECALL_AUTHORIZED: 'Cấp chữ ký thu hồi',
  LIFECYCLE_TRANSACTION_SUBMITTED: 'Gửi giao dịch vòng đời',
  PRODUCT_RECALLED: 'Thu hồi sản phẩm',
  PRODUCT_REPORTED_LOST_STOLEN: 'Báo mất cắp',
  PRODUCT_RETIRED: 'Ngừng sử dụng sản phẩm',
  ALERT_REVIEWED: 'Xử lý cảnh báo',
};

/** Đối tượng bị tác động (audit_logs.target_type). */
export const AUDIT_TARGET_LABELS: Record<string, string> = {
  user: 'Tài khoản',
  party: 'Bên tham gia',
  party_wallet: 'Ví',
  party_registry: 'PartyRegistry',
  organization: 'Doanh nghiệp',
  fee_policy: 'Chính sách phí',
  product: 'Sản phẩm',
  service_request: 'Yêu cầu bảo hành',
  inspection_request: 'Yêu cầu kiểm định',
  transfer_request: 'Chuyển nhượng',
  anomaly_alert: 'Cảnh báo',
};

export interface RuleLabel {
  title: string;
  /** Ý nghĩa và việc Admin nên kiểm tra. */
  hint: string;
}

/** Nhãn cho mọi luật bất thường: đối chiếu Indexer (M3–M11) và luật chạy nền (M12). */
export const ANOMALY_RULE_LABELS: Record<AnomalyRuleCode, RuleLabel> = {
  PARTY_WALLET_MISMATCH: {
    title: 'Ví lệch với PartyRegistry',
    hint: 'Ví trong CSDL khác ví PartyRegistry ghi on-chain. Đối chiếu event WalletLinked của bên này.',
  },
  PRODUCT_NOT_IN_DATABASE: {
    title: 'Sản phẩm on-chain không có trong CSDL',
    hint: 'Có người gọi contract đăng ký sản phẩm không qua web. Xem giao dịch và ví đã gọi.',
  },
  PRODUCT_METADATA_MISMATCH: {
    title: 'Hồ sơ sản phẩm lệch hash',
    hint: 'Hash hồ sơ hoặc nhà phát hành on-chain khác bản nháp trong CSDL.',
  },
  PRODUCT_STATE_MISMATCH: {
    title: 'Trạng thái sản phẩm lệch',
    hint: 'Trạng thái sau bước giao nhận hoặc bán trong CSDL khác event on-chain.',
  },
  PRODUCT_PARTY_UNKNOWN: {
    title: 'Event nhắc tới bên lạ',
    hint: 'Bên nhận hoặc người mua trong event không có trong CSDL.',
  },
  SERVICE_TICKET_UNKNOWN: {
    title: 'Phiếu sửa không khớp yêu cầu',
    hint: 'Event phiếu sửa sai mã, sai sản phẩm hoặc sai trung tâm so với CSDL.',
  },
  SERVICE_EVIDENCE_MISMATCH: {
    title: 'Biên bản sửa lệch hash',
    hint: 'Hash biên bản on-chain khác mọi biên bản trung tâm đã lưu.',
  },
  SERVICE_TICKET_CONFLICT: {
    title: 'Mở phiếu cho yêu cầu đã huỷ',
    hint: 'Chain mở phiếu cho yêu cầu chủ vừa huỷ. Liên hệ trung tâm bảo hành và chủ sở hữu.',
  },
  INSPECTION_UNKNOWN: {
    title: 'Kiểm định không khớp yêu cầu',
    hint: 'Event kiểm định sai mã, sai sản phẩm hoặc sai đơn vị so với CSDL.',
  },
  INSPECTION_REPORT_MISMATCH: {
    title: 'Biên bản kiểm định lệch hash',
    hint: 'Hash biên bản on-chain khác mọi biên bản đơn vị kiểm định đã lưu.',
  },
  INSPECTION_CONFLICT: {
    title: 'Kết quả cho yêu cầu đã huỷ',
    hint: 'Chain ghi kết quả cho yêu cầu vừa bị huỷ hoặc từ chối.',
  },
  TRANSFER_UNKNOWN: {
    title: 'Chuyển nhượng không khớp',
    hint: 'Event chuyển nhượng không khớp sản phẩm, bên tham gia hoặc yêu cầu đang mở.',
  },
  RECALL_REASON_MISMATCH: {
    title: 'Lý do thu hồi lệch hash',
    hint: 'Hash lý do thu hồi on-chain khác lý do nhà sản xuất đã lưu.',
  },
  PUBLIC_VERIFICATION_MISMATCH: {
    title: 'Hộ chiếu công khai lệch chain',
    hint: 'Trang tra cứu đọc contract thấy khác CSDL. Mở hộ chiếu công khai để xem mục lệch.',
  },
  TRANSACTION_STUCK: {
    title: 'Giao dịch treo',
    hint: 'Giao dịch đã gửi quá 15 phút chưa chốt: nonce kẹt, phí thấp hoặc RPC làm rơi giao dịch.',
  },
  WALLET_REPEATED_REVERTS: {
    title: 'Ví bị revert liên tục',
    hint: 'Một ví bị revert từ 5 lần trong 1 giờ: có thể đang thử gọi sai quyền hoặc dò lỗi contract.',
  },
  INDEXER_LAGGING: {
    title: 'Indexer chậm',
    hint: 'Indexer chậm hơn block finalized quá 10 phút. Kiểm tra Worker và RPC ở trang Trạng thái hệ thống.',
  },
  SIGN_IN_BRUTE_FORCE: {
    title: 'Đăng nhập sai dồn dập',
    hint: 'Một email bị đăng nhập sai từ 10 lần trong 15 phút: có thể đang bị dò mật khẩu.',
  },
  RAPID_OWNERSHIP_CHANGES: {
    title: 'Đổi chủ dồn dập',
    hint: 'Sản phẩm đổi chủ từ 3 lần trong 7 ngày: dấu hiệu tiêu thụ hàng gian. Xem lịch sử sở hữu.',
  },
  SERVICE_TICKET_OVERDUE: {
    title: 'Phiếu sửa quá hạn',
    hint: 'Phiếu sửa mở quá 30 ngày chưa đóng. Nhắc trung tâm bảo hành.',
  },
  REQUEST_STALE: {
    title: 'Yêu cầu chờ lâu',
    hint: 'Yêu cầu bảo hành hoặc kiểm định chờ quá 14 ngày chưa ai nhận.',
  },
};

export function ruleLabelOf(code: string): RuleLabel {
  return (
    (ANOMALY_RULE_LABELS as Record<string, RuleLabel | undefined>)[code] ?? {
      title: code,
      hint: 'Luật chưa có mô tả.',
    }
  );
}

export function auditActionLabelOf(code: string): string {
  return (AUDIT_ACTION_LABELS as Record<string, string | undefined>)[code] ?? code;
}

/** Mức độ đi kèm chấm màu và chữ, không dựa vào màu một mình. */
export const SEVERITY_LABELS: Record<AnomalySeverityLevel, StateLabel> = {
  HIGH: { label: 'Cao', tone: 'bad' },
  MEDIUM: { label: 'Trung bình', tone: 'warn' },
  LOW: { label: 'Thấp', tone: 'neutral' },
};

export const ALERT_STATUS_LABELS: Record<AlertStatusCode, StateLabel> = {
  OPEN: { label: 'Đang mở', tone: 'warn' },
  ACKNOWLEDGED: { label: 'Đã xử lý', tone: 'ok' },
  DISMISSED: { label: 'Báo nhầm', tone: 'neutral' },
};

export const DECISION_LABELS: Record<AlertDecision, { label: string; help: string }> = {
  ACKNOWLEDGED: {
    label: 'Đã xử lý',
    help: 'Bất thường có thật và đã được xử lý hoặc chuyển cho người phụ trách.',
  },
  DISMISSED: {
    label: 'Báo nhầm',
    help: 'Không có vấn đề thật (ví dụ thử nghiệm nội bộ, người dùng quên mật khẩu).',
  },
};

/** Tên các trường trong `details` của cảnh báo; trường lạ hiện nguyên mã. */
export const DETAIL_LABELS: Record<string, string> = {
  txHash: 'Giao dịch',
  openTxHash: 'Giao dịch mở phiếu',
  closeTxHash: 'Giao dịch đóng phiếu',
  wallet: 'Ví',
  databaseWallet: 'Ví trong CSDL',
  contractName: 'Contract',
  method: 'Hàm',
  submittedAt: 'Gửi lúc',
  waitingMinutes: 'Đã chờ (phút)',
  reverts: 'Số lần revert',
  windowMinutes: 'Trong khoảng (phút)',
  windowDays: 'Trong khoảng (ngày)',
  indexedBlock: 'Block đã chiếu',
  finalizedBlock: 'Block finalized',
  behindBlocks: 'Chậm (block)',
  behindMinutes: 'Chậm (phút)',
  lastIndexedAt: 'Indexer ghi lần cuối',
  email: 'Email',
  failures: 'Số lần sai',
  accountExists: 'Email có tài khoản',
  changes: 'Số lần đổi chủ',
  requestId: 'Mã yêu cầu',
  openedAt: 'Mở phiếu lúc',
  openDays: 'Đã mở (ngày)',
  kind: 'Loại yêu cầu',
  requestedAt: 'Gửi yêu cầu lúc',
  waitingDays: 'Đã chờ (ngày)',
  eventName: 'Event',
  event: 'Event',
  chainProductId: 'Mã sản phẩm on-chain',
  databaseState: 'Trạng thái trong CSDL',
  onchainState: 'Trạng thái on-chain',
  chainState: 'Trạng thái on-chain',
  checks: 'Mục lệch',
  checkedAtBlock: 'Đọc tại block',
  atBlock: 'Tại block',
};

/** Giá trị đặc biệt trong `details`. */
export const DETAIL_VALUE_LABELS: Record<string, string> = {
  SERVICE: 'Bảo hành',
  INSPECTION: 'Kiểm định',
};
