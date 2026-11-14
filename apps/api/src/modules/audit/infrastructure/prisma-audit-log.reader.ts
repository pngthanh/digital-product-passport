import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { Prisma } from '../../../infrastructure/database/generated/client.js';
import type { AuditLogReader } from '../application/ports/audit-log.reader.js';
import {
  type AuditLogFilter,
  type AuditLogRecord,
  jsonObject,
  type SignInFailureGroup,
} from '../domain/audit-records.js';

type AuditLogRow = Prisma.AuditLogGetPayload<object>;

function toRecord(row: AuditLogRow): AuditLogRecord {
  return {
    id: row.id,
    action: row.action,
    actorUserId: row.actorUserId,
    targetType: row.targetType,
    targetId: row.targetId,
    metadata: jsonObject(row.metadata),
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaAuditLogReader implements AuditLogReader {
  constructor(private readonly prisma: PrismaService) {}

  async page(filter: AuditLogFilter, limit: number): Promise<AuditLogRecord[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        action: filter.action,
        actorUserId: filter.actorUserId,
        targetType: filter.targetType,
        targetId: filter.targetId,
        createdAt: { gte: filter.from, lt: filter.to },
        id: filter.before ? { lt: filter.before } : undefined,
      },
      orderBy: { id: 'desc' },
      take: limit,
    });
    return rows.map(toRecord);
  }

  async latestFor(
    action: string,
    targetType: string,
    targetIds: readonly string[],
  ): Promise<Map<string, AuditLogRecord>> {
    if (targetIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.auditLog.findMany({
      where: { action, targetType, targetId: { in: [...targetIds] } },
      orderBy: { id: 'desc' },
    });
    const latest = new Map<string, AuditLogRecord>();
    for (const row of rows) {
      if (row.targetId && !latest.has(row.targetId)) {
        latest.set(row.targetId, toRecord(row));
      }
    }
    return latest;
  }

  async signInFailures(since: Date, minCount: number): Promise<SignInFailureGroup[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ email: string | null; count: bigint; user_id: string | null }>
    >`
      SELECT lower(metadata->>'email') AS email,
             count(*) AS count,
             max(target_id) AS user_id
        FROM audit_logs
       WHERE action = 'SIGN_IN_FAILED' AND created_at >= ${since}
       GROUP BY lower(metadata->>'email')
      HAVING count(*) >= ${minCount}
    `;
    return rows.flatMap((row) =>
      row.email ? [{ email: row.email, count: Number(row.count), userId: row.user_id }] : [],
    );
  }
}
