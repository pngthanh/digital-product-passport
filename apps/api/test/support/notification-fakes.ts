import { TestClock } from './test-config.js';
import type {
  NewNotification,
  NotificationRepository,
} from '../../src/modules/notifications/application/ports/notification.repository.js';
import { Notifier } from '../../src/modules/notifications/application/notifier.service.js';
import type { NotificationRecord } from '../../src/modules/notifications/domain/notification.js';

/** Bảng notifications trong bộ nhớ, cùng ngữ nghĩa với PrismaNotificationRepository. */
export class InMemoryNotifications implements NotificationRepository {
  readonly rows: (NotificationRecord & { sentAt: Date })[] = [];

  async insertMany(rows: readonly NewNotification[]) {
    for (const row of rows) {
      this.rows.push({
        id: `notification-${this.rows.length + 1}`,
        recipientPartyId: row.recipientPartyId,
        type: row.type,
        payload: row.payload,
        createdAt: row.sentAt,
        sentAt: row.sentAt,
        readAt: null,
      });
    }
    return rows.length;
  }

  async listFor(partyIds: readonly string[], page: { page: number; pageSize: number }) {
    const mine = this.rows.filter((row) => partyIds.includes(row.recipientPartyId)).toReversed();
    const start = (page.page - 1) * page.pageSize;
    return { items: mine.slice(start, start + page.pageSize), total: mine.length };
  }

  async countUnread(partyIds: readonly string[]) {
    return this.rows.filter((row) => partyIds.includes(row.recipientPartyId) && !row.readAt).length;
  }

  async markRead(partyIds: readonly string[], ids: readonly string[] | null, at: Date) {
    let count = 0;
    for (const row of this.rows) {
      if (
        partyIds.includes(row.recipientPartyId) &&
        !row.readAt &&
        (!ids || ids.includes(row.id))
      ) {
        row.readAt = at;
        count += 1;
      }
    }
    return count;
  }

  /** Loại thông báo mà một Party đã nhận, theo thứ tự tạo. */
  typesFor(partyId: string): string[] {
    return this.rows.filter((row) => row.recipientPartyId === partyId).map((row) => row.type);
  }
}

/** Notifier thật ghi vào bảng trong bộ nhớ. */
export function inMemoryNotifier(rows = new InMemoryNotifications()) {
  return { notifier: new Notifier(rows, new TestClock()), notifications: rows };
}
