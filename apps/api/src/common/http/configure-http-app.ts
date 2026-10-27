import type { INestApplication } from '@nestjs/common';
import type { AppConfigService } from '../../config/app-config.service.js';
import { HttpExceptionFilter } from './http-exception.filter.js';
import { REQUEST_ID_HEADER } from './request-id.middleware.js';

export const API_PREFIX = 'api/v1';

/** Cấu hình HTTP dùng chung cho main.ts và test e2e, để test chạy đúng như production. */
export function configureHttpApp(app: INestApplication, config: AppConfigService): void {
  app.setGlobalPrefix(API_PREFIX);
  app.enableCors({
    origin: config.webOrigin,
    credentials: true,
    exposedHeaders: [REQUEST_ID_HEADER],
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
}
