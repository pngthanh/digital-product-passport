import { Injectable } from '@nestjs/common';
import { NOTIFICATION_TYPES, type NotificationType } from '@dpp/shared';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import type { Notification } from '../../../infrastructure/database/generated/client.js';
import { prismaFrom } from '../../../infrastructure/database/prisma-scope.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type {
  NewNotification,
  NotificationRepository,
} from '../application/ports/notification.repository.js';
import { type NotificationRecord, parsePayload } from '../domain/notification.js';

function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

/** Dòng hỏng (loại lạ, payload thiếu) bị bỏ qua thay vì làm hỏng cả danh sách. */
function toRecord(row: Notification): NotificationRecord | null {
  const payload = parsePayload(row.payload);
  if (!payload || !isNotificationType(row.notificationType)) {
    return null;
  }
  return {
    id: row.id,
    recipientPartyId: row.recipientPartyId,
    type: row.notificationType,
    payload,
    createdAt: row.createdAt,
    readAt: row.readAt,
  };
}

@Injectable()
export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insertMany(rows: readonly NewNotification[], scope?: TransactionScope): Promise<number> {
    const { count } = await prismaFrom(this.prisma, scope).notification.createMany({
      data: rows.map((row) => ({
        recipientPartyId: row.recipientPartyId,
        channel: 'IN_APP',
        notificationType: row.type,
        payload: { ...row.payload, product: { ...row.payload.product } },
        status: 'SENT',
        sentAt: row.sentAt,
      })),
    });
    return count;
  }

  async listFor(
    partyIds: readonly string[],
    page: { page: number; pageSize: number },
  ): Promise<{ items: NotificationRecord[]; total: number }> {
    const where = { recipientPartyId: { in: [...partyIds] }, channel: 'IN_APP' as const };
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return {
      items: rows.flatMap((row) => {
        const record = toRecord(row);
        return record ? [record] : [];
      }),
      total,
    };
  }

  countUnread(partyIds: readonly string[]): Promise<number> {
    return this.prisma.notification.count({
      where: { recipientPartyId: { in: [...partyIds] }, channel: 'IN_APP', readAt: null },
    });
  }

  async markRead(
    partyIds: readonly string[],
    ids: readonly string[] | null,
    at: Date,
  ): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: {
        recipientPartyId: { in: [...partyIds] },
        readAt: null,
        ...(ids ? { id: { in: [...ids] } } : {}),
      },
      data: { readAt: at },
    });
    return count;
  }
}
