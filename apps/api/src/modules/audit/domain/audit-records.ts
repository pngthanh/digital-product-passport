import type {
  AlertDecision,
  AlertStatusCode,
  AnomalySeverityLevel,
  AuditMetadataValue,
} from '@dpp/shared';

/** Một dòng audit_logs đọc ra (AUD-01). */
export interface AuditLogRecord {
  id: string;
  action: string;
  actorUserId: string | null;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface AuditLogFilter {
  action?: string;
  actorUserId?: string;
  targetType?: string;
  targetId?: string;
  from?: Date;
  /** Không gồm mốc này. */
  to?: Date;
  /** Lấy các dòng cũ hơn dòng có id này (uuid v7 tăng theo thời gian). */
  before?: string;
}

/** Một dòng anomaly_alerts đọc ra (AUD-04). */
export interface AnomalyAlertRecord {
  id: string;
  ruleCode: string;
  severity: AnomalySeverityLevel;
  status: AlertStatusCode;
  productId: string | null;
  partyId: string | null;
  details: Record<string, AuditMetadataValue>;
  detectedAt: Date;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
}

export interface AnomalyAlertFilter {
  status: AlertStatusCode;
  severity?: AnomalySeverityLevel;
  ruleCode?: string;
  before?: string;
}

/** Số lần đăng nhập sai theo email trong một khoảng (luật SIGN_IN_BRUTE_FORCE). */
export interface SignInFailureGroup {
  email: string;
  count: number;
  /** Tài khoản có email đó, nếu có. */
  userId: string | null;
}

export interface AlertReviewDecision {
  decision: AlertDecision;
  reviewerUserId: string;
  at: Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** JSONB metadata/details → object; dữ liệu khác dạng thì trả `null`. */
export function jsonObject(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isDetailValue(value: unknown): value is AuditMetadataValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

/** Chỉ giữ giá trị đơn (chuỗi, số, boolean, null) của details cảnh báo. */
export function detailValues(value: unknown): Record<string, AuditMetadataValue> {
  const result: Record<string, AuditMetadataValue> = {};
  for (const [key, item] of Object.entries(jsonObject(value) ?? {})) {
    if (isDetailValue(item)) {
      result[key] = item;
    }
  }
  return result;
}
