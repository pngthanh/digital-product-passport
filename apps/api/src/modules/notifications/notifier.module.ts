import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { Notifier } from './application/notifier.service.js';
import { NOTIFICATION_PORT_PROVIDERS } from './notifications.providers.js';

/** Phần ghi thông báo; module khác (projector trong Worker, use case trong API) import để gọi Notifier. */
@Module({
  imports: [DatabaseModule],
  providers: [...NOTIFICATION_PORT_PROVIDERS, Notifier],
  exports: [Notifier],
})
export class NotifierModule {}
