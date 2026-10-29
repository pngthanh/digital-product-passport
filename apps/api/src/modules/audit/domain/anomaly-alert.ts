/** Mã luật phát hiện bất thường, ổn định để màn hình quản trị (M12) lọc theo. */
export const AnomalyRule = {
  /** Ví của Party trong CSDL khác ví PartyRegistry ghi on-chain. */
  PARTY_WALLET_MISMATCH: 'PARTY_WALLET_MISMATCH',
  /** Sản phẩm được đăng ký on-chain nhưng CSDL không có hồ sơ tương ứng. */
  PRODUCT_NOT_IN_DATABASE: 'PRODUCT_NOT_IN_DATABASE',
  /** Hash hồ sơ hoặc nhà phát hành on-chain khác bản nháp trong CSDL. */
  PRODUCT_METADATA_MISMATCH: 'PRODUCT_METADATA_MISMATCH',
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
