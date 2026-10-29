/** Mã luật phát hiện bất thường, ổn định để màn hình quản trị (M12) lọc theo. */
export const AnomalyRule = {
  /** Ví của Party trong CSDL khác ví PartyRegistry ghi on-chain. */
  PARTY_WALLET_MISMATCH: 'PARTY_WALLET_MISMATCH',
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
