import type { Provider } from '@nestjs/common';
import { CLOCK, SYSTEM_CLOCK } from '../../common/time/clock.js';
import { NOTIFICATION_REPOSITORY } from './application/ports/notification.repository.js';
import { PrismaNotificationRepository } from './infrastructure/prisma-notification.repository.js';

/** Nối cổng của tầng application với hiện thực infrastructure; dùng cho API và Worker. */
export const NOTIFICATION_PORT_PROVIDERS: Provider[] = [
  { provide: CLOCK, useValue: SYSTEM_CLOCK },
  { provide: NOTIFICATION_REPOSITORY, useClass: PrismaNotificationRepository },
];
