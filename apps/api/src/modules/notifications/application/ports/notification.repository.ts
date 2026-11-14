import type { NotificationType } from '@dpp/shared';
import type { TransactionScope } from '../../../../common/persistence/transaction-scope.js';
import type { NotificationPayload, NotificationRecord } from '../../domain/notification.js';

export interface NewNotification {
  recipientPartyId: string;
  type: NotificationType;
  payload: NotificationPayload;
  sentAt: Date;
}

/** Bảng notifications (kênh IN_APP). */
export interface NotificationRepository {
  insertMany(rows: readonly NewNotification[], scope?: TransactionScope): Promise<number>;
  listFor(
    partyIds: readonly string[],
    page: { page: number; pageSize: number },
  ): Promise<{ items: NotificationRecord[]; total: number }>;
  countUnread(partyIds: readonly string[]): Promise<number>;
  /** `ids` rỗng là tất cả thông báo chưa đọc của các Party. */
  markRead(partyIds: readonly string[], ids: readonly string[] | null, at: Date): Promise<number>;
}

export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');
