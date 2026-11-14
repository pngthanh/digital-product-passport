import type {
  AuditLogFilter,
  AuditLogRecord,
  SignInFailureGroup,
} from '../../domain/audit-records.js';

/** Đọc audit_logs (chỉ đọc; bảng chỉ cho INSERT). */
export interface AuditLogReader {
  /** Mới nhất trước, tối đa `limit` dòng. */
  page(filter: AuditLogFilter, limit: number): Promise<AuditLogRecord[]>;
  /** Dòng mới nhất của từng đối tượng cho một hành động (ví dụ ghi chú xử lý cảnh báo). */
  latestFor(
    action: string,
    targetType: string,
    targetIds: readonly string[],
  ): Promise<Map<string, AuditLogRecord>>;
  /** Email bị đăng nhập sai ít nhất `minCount` lần từ `since`. */
  signInFailures(since: Date, minCount: number): Promise<SignInFailureGroup[]>;
}

export const AUDIT_LOG_READER = Symbol('AUDIT_LOG_READER');
