import { Injectable } from '@nestjs/common';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import { prismaFrom } from '../../../infrastructure/database/prisma-scope.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { AuditLogWriter } from '../application/audit-log.writer.js';
import type { AuditEntry } from '../domain/audit-entry.js';

@Injectable()
export class PrismaAuditLogWriter implements AuditLogWriter {
  constructor(private readonly prisma: PrismaService) {}

  async append(entry: AuditEntry, scope?: TransactionScope): Promise<void> {
    await prismaFrom(this.prisma, scope).auditLog.create({
      data: {
        action: entry.action,
        actorUserId: entry.actorUserId,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata: entry.metadata,
        ipAddress: entry.client?.ipAddress ?? null,
        userAgent: entry.client?.userAgent ?? null,
      },
    });
  }
}
