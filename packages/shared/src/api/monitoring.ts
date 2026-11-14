import type { AuthStatus, OrgType, ProductState, WarrantyState } from '../domain/enums.js';

/**
 * (M12) Mã hành động trong audit_logs. API ghi đúng các mã này (test đối chiếu với `AuditAction`);
 * web dùng để lọc và hiển thị nhãn tiếng Việt.
 */
export const AUDIT_ACTIONS = [
  'ACCOUNT_REGISTERED',
  'SIGNED_IN',
  'SIGN_IN_FAILED',
  'SIGNED_OUT',
  'WALLET_LINK_AUTHORIZED',
  'WALLET_LINK_SUBMITTED',
  'WALLET_ACTIVATED',
  'WALLET_ROTATED',
  'ORG_APPLICATION_AUTHORIZED',
  'ORG_TRANSACTION_SUBMITTED',
  'ORG_APPLIED',
  'ORG_APPROVED',
  'ORG_REJECTED',
  'ORG_DISABLED',
  'ORG_FEE_REFUNDED',
  'FEE_POLICY_UPDATED',
  'ADMIN_DECISION_PREPARED',
  'ADMIN_TRANSACTION_SUBMITTED',
  'PRODUCT_REGISTRATION_AUTHORIZED',
  'PRODUCT_TRANSACTION_SUBMITTED',
  'PRODUCT_REGISTERED',
  'PRODUCT_DRAFT_DELETED',
  'PRODUCT_SALE_AUTHORIZED',
  'PRODUCT_SOLD',
  'SERVICE_REQUESTED',
  'SERVICE_REQUEST_CANCELLED',
  'SERVICE_OPENING_AUTHORIZED',
  'SERVICE_RESULT_PREPARED',
  'SERVICE_TRANSACTION_SUBMITTED',
  'INSPECTION_REQUESTED',
  'INSPECTION_REQUEST_CANCELLED',
  'INSPECTION_REQUEST_DECLINED',
  'INSPECTION_RESULT_PREPARED',
  'INSPECTION_TRANSACTION_SUBMITTED',
  'TRANSFER_AUTHORIZED',
  'TRANSFER_TRANSACTION_SUBMITTED',
  'RECALL_AUTHORIZED',
  'LIFECYCLE_TRANSACTION_SUBMITTED',
  'PRODUCT_RECALLED',
  'PRODUCT_REPORTED_LOST_STOLEN',
  'PRODUCT_RETIRED',
  'ALERT_REVIEWED',
] as const;

export type AuditActionCode = (typeof AUDIT_ACTIONS)[number];

/** (M12) Mã luật phát hiện bất thường; test API đối chiếu với `AnomalyRule`. */
export const ANOMALY_RULES = [
  'PARTY_WALLET_MISMATCH',
  'PRODUCT_NOT_IN_DATABASE',
  'PRODUCT_METADATA_MISMATCH',
  'PRODUCT_STATE_MISMATCH',
  'PRODUCT_PARTY_UNKNOWN',
  'SERVICE_TICKET_UNKNOWN',
  'SERVICE_EVIDENCE_MISMATCH',
  'SERVICE_TICKET_CONFLICT',
  'INSPECTION_UNKNOWN',
  'INSPECTION_REPORT_MISMATCH',
  'INSPECTION_CONFLICT',
  'TRANSFER_UNKNOWN',
  'RECALL_REASON_MISMATCH',
  'PUBLIC_VERIFICATION_MISMATCH',
  'TRANSACTION_STUCK',
  'WALLET_REPEATED_REVERTS',
  'INDEXER_LAGGING',
  'SIGN_IN_BRUTE_FORCE',
  'RAPID_OWNERSHIP_CHANGES',
  'SERVICE_TICKET_OVERDUE',
  'REQUEST_STALE',
] as const;

export type AnomalyRuleCode = (typeof ANOMALY_RULES)[number];

export const ANOMALY_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type AnomalySeverityLevel = (typeof ANOMALY_SEVERITIES)[number];

export const ALERT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'DISMISSED'] as const;
export type AlertStatusCode = (typeof ALERT_STATUSES)[number];

/** Quyết định của Admin cho cảnh báo đang mở (AUD-04). */
export const ALERT_DECISIONS = ['ACKNOWLEDGED', 'DISMISSED'] as const;
export type AlertDecision = (typeof ALERT_DECISIONS)[number];

export const ALERT_NOTE_MIN_LENGTH = 5;
export const ALERT_NOTE_MAX_LENGTH = 1000;

export type AuditMetadataValue = string | number | boolean | null;

/** Người thực hiện (Admin xem được tên và email). */
export interface AuditActor {
  userId: string;
  fullName: string;
  email: string;
}

/** Một dòng audit_logs (AUD-01). */
export interface AuditLogView {
  id: string;
  action: string;
  actor: AuditActor | null;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

/** `GET /admin/audit-logs`: mới nhất trước; `nextCursor` để tải trang sau. */
export interface AuditLogPage {
  items: AuditLogView[];
  nextCursor: string | null;
}

/** Sản phẩm, bên liên quan tới một cảnh báo. */
export interface AlertProduct {
  id: string;
  serialNumber: string;
  modelName: string;
  publicCode: string;
}

export interface AlertParty {
  kind: 'ORGANIZATION' | 'PERSON';
  name: string;
  email: string | null;
}

export interface AlertReview {
  decision: AlertDecision;
  note: string | null;
  by: AuditActor | null;
  at: string;
}

/** Một cảnh báo bất thường (AUD-04). */
export interface AnomalyAlertView {
  id: string;
  ruleCode: string;
  severity: AnomalySeverityLevel;
  status: AlertStatusCode;
  detectedAt: string;
  product: AlertProduct | null;
  party: AlertParty | null;
  details: Record<string, AuditMetadataValue>;
  review: AlertReview | null;
}

/** `GET /admin/alerts`: theo trạng thái, mới nhất trước. */
export interface AnomalyAlertPage {
  items: AnomalyAlertView[];
  nextCursor: string | null;
  counts: Record<AlertStatusCode, number>;
}

/** `GET /admin/alerts/summary`: cho số cạnh mục Cảnh báo. */
export interface AlertSummary {
  open: number;
  openHigh: number;
}

/** `POST /admin/alerts/:id/review`. */
export interface ReviewAlertInput {
  decision: AlertDecision;
  note: string;
}

/** Giao dịch người dùng gửi qua web theo hàm contract, 30 ngày gần nhất. */
export interface TransactionMethodStats {
  contractName: string;
  method: string;
  total: number;
  confirmed: number;
  reverted: number;
  /** Gas trung bình của giao dịch đã chốt (chuỗi thập phân). */
  averageGasUsed: string | null;
  /** Giây trung bình từ lúc web báo gửi tới lúc chốt. */
  averageConfirmSeconds: number | null;
}

/** `GET /admin/dashboard` (AUD-02). */
export interface DashboardStatistics {
  generatedAt: string;
  accounts: { total: number; withWallet: number; admins: number };
  organizations: Record<OrgType, Record<'DRAFT' | AuthStatus, number>>;
  products: { drafts: number; byState: Record<ProductState, number> };
  warranties: Record<WarrantyState, number>;
  service: { pending: number; inRepair: number; repaired: number; notRepaired: number };
  inspections: { pending: number; completed: number; declined: number };
  transfers: {
    pending: number;
    completed: number;
    rejected: number;
    cancelled: number;
    expired: number;
  };
  transactions: {
    byStatus: Record<'QUEUED' | 'SUBMITTED' | 'CONFIRMED' | 'REVERTED' | 'FAILED', number>;
    methods: TransactionMethodStats[];
  };
  /** Event đã chốt mỗi ngày (giờ Việt Nam), 14 ngày gần nhất, cũ nhất trước. */
  activity: { day: string; events: number }[];
  indexer: { behindBlocks: string | null; lastIndexedAt: string | null };
  alerts: Record<AnomalySeverityLevel, number>;
}
