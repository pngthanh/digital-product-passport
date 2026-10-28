import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { AppConfigService } from '../../config/app-config.service.js';
import { HttpExceptionFilter } from './http-exception.filter.js';
import { REQUEST_ID_HEADER } from './request-id.middleware.js';

export const API_PREFIX = 'api/v1';

/** Cấu hình HTTP dùng chung cho main.ts và test e2e, để test chạy đúng như production. */
export function configureHttpApp(app: NestExpressApplication, config: AppConfigService): void {
  // Web (Next.js) chuyển tiếp /api/v1 sang API trên cùng máy: lấy IP thật từ X-Forwarded-For.
  app.set('trust proxy', 'loopback');
  app.use(cookieParser());
  app.setGlobalPrefix(API_PREFIX);
  app.enableCors({
    origin: config.webOrigin,
    credentials: true,
    exposedHeaders: [REQUEST_ID_HEADER],
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
}
