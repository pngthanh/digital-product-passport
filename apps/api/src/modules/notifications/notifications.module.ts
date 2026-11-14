import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { IdentityModule } from '../identity/index.js';
import { OrganizationsModule } from '../organizations/index.js';
import {
  GetNotificationSummary,
  ListMyNotifications,
  MarkNotificationsRead,
  NotificationRecipients,
} from './application/notification-queries.js';
import { NOTIFICATION_PORT_PROVIDERS } from './notifications.providers.js';
import { NotificationsController } from './presentation/notifications.controller.js';

/** Notifications (tiến trình API, M10): danh sách, số chưa đọc, đánh dấu đã đọc. */
@Module({
  imports: [DatabaseModule, IdentityModule, OrganizationsModule],
  controllers: [NotificationsController],
  providers: [
    ...NOTIFICATION_PORT_PROVIDERS,
    NotificationRecipients,
    ListMyNotifications,
    GetNotificationSummary,
    MarkNotificationsRead,
  ],
})
export class NotificationsModule {}
