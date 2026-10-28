import { Inject, Injectable, Logger } from '@nestjs/common';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import type { AuditEntry } from '../domain/audit-entry.js';
import { AUDIT_LOG_WRITER, type AuditLogWriter } from './audit-log.writer.js';

/** Điểm vào duy nhất để module khác ghi nhật ký kiểm toán. */
@Injectable()
export class AuditTrail {
  private readonly logger = new Logger(AuditTrail.name);

  constructor(@Inject(AUDIT_LOG_WRITER) private readonly writer: AuditLogWriter) {}

  /**
   * Ghi một dòng audit. Trong giao dịch (`scope`) lỗi được ném lại để huỷ cả giao dịch;
   * ngoài giao dịch thì chỉ ghi log lỗi, không làm hỏng thao tác chính của người dùng.
   */
  async record(entry: AuditEntry, scope?: TransactionScope): Promise<void> {
    if (scope) {
      await this.writer.append(entry, scope);
      return;
    }
    try {
      await this.writer.append(entry);
    } catch (error) {
      this.logger.error(
        `Không ghi được audit ${entry.action}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
