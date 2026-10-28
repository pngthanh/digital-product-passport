import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import type { AuditEntry } from '../domain/audit-entry.js';

/** Cổng ghi audit_logs (bảng chỉ cho INSERT). */
export interface AuditLogWriter {
  append(entry: AuditEntry, scope?: TransactionScope): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol('AUDIT_LOG_WRITER');
