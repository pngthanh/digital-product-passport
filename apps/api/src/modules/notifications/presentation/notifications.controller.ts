import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import type { MyNotifications, NotificationSummary } from '@dpp/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../common/http/zod-validation.pipe.js';
import { type AuthenticatedUser, CurrentUser, SessionGuard } from '../../identity/index.js';
import {
  GetNotificationSummary,
  ListMyNotifications,
  MarkNotificationsRead,
} from '../application/notification-queries.js';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
});
type ListQuery = z.infer<typeof listQuerySchema>;

const markReadSchema = z.object({
  ids: z.array(z.uuid('Mã thông báo không hợp lệ')).min(1).max(100).optional(),
});
type MarkReadBody = z.infer<typeof markReadSchema>;

/** Thông báo trong ứng dụng (M10) của người dùng và tổ chức họ đại diện. */
@Controller('me/notifications')
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(
    private readonly listNotifications: ListMyNotifications,
    private readonly summary: GetNotificationSummary,
    private readonly markRead: MarkNotificationsRead,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ): Promise<MyNotifications> {
    return this.listNotifications.execute(user, query);
  }

  @Get('summary')
  unread(@CurrentUser() user: AuthenticatedUser): Promise<NotificationSummary> {
    return this.summary.execute(user);
  }

  @Post('read')
  @HttpCode(200)
  read(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(markReadSchema)) body: MarkReadBody,
  ): Promise<NotificationSummary> {
    return this.markRead.execute(user, body.ids ?? null);
  }
}
