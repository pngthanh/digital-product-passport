import { Inject, Injectable } from '@nestjs/common';
import type { MyNotifications, NotificationSummary, NotificationView } from '@dpp/shared';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import { IdentityDirectory, type AuthenticatedUser } from '../../identity/index.js';
import { OrganizationDirectory } from '../../organizations/index.js';
import type { NotificationRecord } from '../domain/notification.js';
import {
  NOTIFICATION_REPOSITORY,
  type NotificationRepository,
} from './ports/notification.repository.js';

/**
 * Party nhận thông báo của người dùng: Party cá nhân và tổ chức người đó đại diện (người đại diện
 * đọc thay tổ chức, giống "sản phẩm của tôi" ở M9).
 */
@Injectable()
export class NotificationRecipients {
  constructor(
    private readonly identity: IdentityDirectory,
    private readonly organizations: OrganizationDirectory,
  ) {}

  async of(userId: string): Promise<string[]> {
    const { personal, organization } = await this.split(userId);
    return [personal, organization].filter((id): id is string => !!id);
  }

  async split(userId: string): Promise<{ personal: string | null; organization: string | null }> {
    const [actor, organization] = await Promise.all([
      this.identity.actorOf(userId),
      this.organizations.representedBy(userId),
    ]);
    return { personal: actor?.partyId ?? null, organization: organization?.id ?? null };
  }
}

/** Thông báo của người dùng, mới nhất trước; tên tổ chức tra lúc đọc. */
@Injectable()
export class ListMyNotifications {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly notifications: NotificationRepository,
    @Inject(NotificationRecipients)
    private readonly recipients: Pick<NotificationRecipients, 'split'>,
    @Inject(OrganizationDirectory)
    private readonly organizations: Pick<OrganizationDirectory, 'describe'>,
  ) {}

  async execute(
    user: AuthenticatedUser,
    page: { page: number; pageSize: number },
  ): Promise<MyNotifications> {
    const { personal, organization } = await this.recipients.split(user.id);
    const partyIds = [personal, organization].filter((id): id is string => !!id);
    if (partyIds.length === 0) {
      return { items: [], total: 0, unread: 0, ...page };
    }
    const [{ items, total }, unread] = await Promise.all([
      this.notifications.listFor(partyIds, page),
      this.notifications.countUnread(partyIds),
    ]);
    const names = await this.organizations.describe(
      items.flatMap((item) => (item.payload.organizationId ? [item.payload.organizationId] : [])),
    );
    return {
      items: items.map((item) => present(item, names, organization)),
      total,
      unread,
      ...page,
    };
  }
}

function present(
  record: NotificationRecord,
  organizations: ReadonlyMap<string, { name: string }>,
  representedOrganization: string | null,
): NotificationView {
  const { payload } = record;
  return {
    id: record.id,
    type: record.type,
    createdAt: record.createdAt.toISOString(),
    readAt: record.readAt?.toISOString() ?? null,
    product: payload.product,
    organizationName: payload.organizationId
      ? (organizations.get(payload.organizationId)?.name ?? null)
      : null,
    reason: payload.reason,
    result: payload.result,
    repaired: payload.repaired,
    forOrganization: record.recipientPartyId === representedOrganization,
  };
}

/** Số thông báo chưa đọc cho chuông trên menu. */
@Injectable()
export class GetNotificationSummary {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly notifications: NotificationRepository,
    @Inject(NotificationRecipients) private readonly recipients: Pick<NotificationRecipients, 'of'>,
  ) {}

  async execute(user: AuthenticatedUser): Promise<NotificationSummary> {
    const partyIds = await this.recipients.of(user.id);
    return { unread: partyIds.length > 0 ? await this.notifications.countUnread(partyIds) : 0 };
  }
}

/** Đánh dấu đã đọc một số thông báo, hoặc tất cả khi không truyền `ids`. */
@Injectable()
export class MarkNotificationsRead {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly notifications: NotificationRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(NotificationRecipients) private readonly recipients: Pick<NotificationRecipients, 'of'>,
  ) {}

  async execute(
    user: AuthenticatedUser,
    ids: readonly string[] | null,
  ): Promise<NotificationSummary> {
    const partyIds = await this.recipients.of(user.id);
    if (partyIds.length === 0) {
      return { unread: 0 };
    }
    await this.notifications.markRead(partyIds, ids, this.clock.now());
    return { unread: await this.notifications.countUnread(partyIds) };
  }
}
