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
}
