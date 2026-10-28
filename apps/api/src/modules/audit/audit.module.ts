import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AUDIT_LOG_WRITER } from './application/audit-log.writer.js';
import { AuditTrail } from './application/audit-trail.service.js';
import { PrismaAuditLogWriter } from './infrastructure/prisma-audit-log.writer.js';

/** M2 chỉ ghi audit; màn hình xem và phát hiện bất thường thuộc M12. */
@Module({
  imports: [DatabaseModule],
  providers: [AuditTrail, { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter }],
  exports: [AuditTrail],
})
export class AuditModule {}
