/** Mã luật phát hiện bất thường, ổn định để màn hình quản trị (M12) lọc theo. */
export const AnomalyRule = {
  /** Ví của Party trong CSDL khác ví PartyRegistry ghi on-chain. */
  PARTY_WALLET_MISMATCH: 'PARTY_WALLET_MISMATCH',
  /** Sản phẩm được đăng ký on-chain nhưng CSDL không có hồ sơ tương ứng. */
  PRODUCT_NOT_IN_DATABASE: 'PRODUCT_NOT_IN_DATABASE',
  /** Hash hồ sơ hoặc nhà phát hành on-chain khác bản nháp trong CSDL. */
  PRODUCT_METADATA_MISMATCH: 'PRODUCT_METADATA_MISMATCH',
  /** (M6) Trạng thái sau một bước giao nhận/bán trong CSDL khác ProductStateChanged on-chain. */
  PRODUCT_STATE_MISMATCH: 'PRODUCT_STATE_MISMATCH',
  /** (M6) Event nhắc tới một Party (bên nhận, người mua) mà CSDL không có. */
  PRODUCT_PARTY_UNKNOWN: 'PRODUCT_PARTY_UNKNOWN',
  /** (M7) Event phiếu sửa chữa không khớp yêu cầu nào trong CSDL (sai ticketId, sản phẩm, trung tâm). */
  SERVICE_TICKET_UNKNOWN: 'SERVICE_TICKET_UNKNOWN',
  /** (M7) Hash biên bản ghi on-chain khác mọi biên bản trung tâm đã lưu trong CSDL. */
  SERVICE_EVIDENCE_MISMATCH: 'SERVICE_EVIDENCE_MISMATCH',
  /** (M7) Chain mở phiếu cho yêu cầu chủ sở hữu vừa huỷ; yêu cầu mới hơn của sản phẩm bị huỷ theo. */
  SERVICE_TICKET_CONFLICT: 'SERVICE_TICKET_CONFLICT',
  /** (M8) Event kiểm định không khớp yêu cầu nào trong CSDL (sai mã, sản phẩm, đơn vị kiểm định). */
  INSPECTION_UNKNOWN: 'INSPECTION_UNKNOWN',
  /** (M8) Hash biên bản kiểm định on-chain khác mọi biên bản đơn vị kiểm định đã lưu. */
  INSPECTION_REPORT_MISMATCH: 'INSPECTION_REPORT_MISMATCH',
  /** (M8) Chain ghi kết quả cho yêu cầu vừa bị huỷ hoặc từ chối; yêu cầu vẫn thành đã có kết quả. */
  INSPECTION_CONFLICT: 'INSPECTION_CONFLICT',
  /** (M9) Event chuyển nhượng không khớp sản phẩm, Party hay yêu cầu đang mở trong CSDL. */
  TRANSFER_UNKNOWN: 'TRANSFER_UNKNOWN',
  /** (M10) Thu hồi on-chain có hash lý do khác lý do nhà sản xuất đã lưu (hoặc không lưu). */
  RECALL_REASON_MISMATCH: 'RECALL_REASON_MISMATCH',
  /**
   * (M11) Hộ chiếu công khai đọc contract tại block Indexer đã chốt thấy khác CSDL (hồ sơ, doanh
   * nghiệp, trạng thái, bên giữ hàng, chủ sở hữu hoặc bảo hành).
   */
  PUBLIC_VERIFICATION_MISMATCH: 'PUBLIC_VERIFICATION_MISMATCH',
  /** (M12) Giao dịch web đã báo quá 15 phút mà chưa chốt (treo, nonce kẹt, RPC mất giao dịch). */
  TRANSACTION_STUCK: 'TRANSACTION_STUCK',
  /** (M12) Một ví bị revert từ 5 lần trong 1 giờ (thử sai quyền, dò lỗi contract). */
  WALLET_REPEATED_REVERTS: 'WALLET_REPEATED_REVERTS',
  /** (M12) Indexer không tiến lên quá 10 phút trong khi chain vẫn có block mới. */
  INDEXER_LAGGING: 'INDEXER_LAGGING',
  /** (M12) Một email bị đăng nhập sai từ 10 lần trong 15 phút (dò mật khẩu). */
  SIGN_IN_BRUTE_FORCE: 'SIGN_IN_BRUTE_FORCE',
  /** (M12) Một sản phẩm đổi chủ từ 3 lần trong 7 ngày (dấu hiệu tiêu thụ hàng gian). */
  RAPID_OWNERSHIP_CHANGES: 'RAPID_OWNERSHIP_CHANGES',
  /** (M12) Phiếu sửa chữa mở quá 30 ngày chưa đóng. */
  SERVICE_TICKET_OVERDUE: 'SERVICE_TICKET_OVERDUE',
  /** (M12) Yêu cầu bảo hành hoặc kiểm định chờ quá 14 ngày chưa ai xử lý. */
  REQUEST_STALE: 'REQUEST_STALE',
} as const;

export type AnomalyRule = (typeof AnomalyRule)[keyof typeof AnomalyRule];

export type AnomalySeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export type AnomalyDetailValue = string | number | boolean | null;

export interface NewAnomalyAlert {
  ruleCode: AnomalyRule;
  severity: AnomalySeverity;
  partyId?: string;
  productId?: string;
  details: Readonly<Record<string, AnomalyDetailValue>>;
  /**
   * (M12) Khoá chống trùng của luật chạy nền (mã giao dịch, mã yêu cầu, email…), lưu vào
   * `details.dedupeKey`. Có khoá thì bỏ qua khi đã từng có cảnh báo cùng luật, cùng khoá; không có
   * khoá thì bỏ qua khi còn cảnh báo OPEN cùng luật, cùng đối tượng.
   */
  dedupeKey?: string;
  /** Với `dedupeKey`: sau bấy nhiêu giờ kể từ lần báo trước (đã xử lý) thì được báo lại. */
  repeatAfterHours?: number;
}
