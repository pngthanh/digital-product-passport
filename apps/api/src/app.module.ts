import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { OriginCheckMiddleware } from './common/http/origin-check.middleware.js';
import {
  AUTH_THROTTLER,
  PUBLIC_THROTTLER,
  publicThrottlerKey,
  RATE_LIMIT_WINDOW_MS,
  rateLimitMessage,
} from './common/http/rate-limit.js';
import { RequestIdMiddleware } from './common/http/request-id.middleware.js';
import { AppConfigModule } from './config/app-config.module.js';
import { AppConfigService } from './config/app-config.service.js';
import { HealthModule } from './modules/health/index.js';
import { IdentityModule } from './modules/identity/index.js';
import { InspectionModule } from './modules/inspection/index.js';
import { OrganizationsModule } from './modules/organizations/index.js';
import { ProductsModule } from './modules/products/index.js';
import { ServiceModule } from './modules/service/index.js';
import { TransferModule } from './modules/transfer/index.js';
import { LifecycleModule } from './modules/lifecycle/index.js';
import { NotificationsModule } from './modules/notifications/index.js';
import { VerificationModule } from './modules/verification/index.js';

/** Module gốc của tiến trình API (HTTP). Mỗi module nghiệp vụ mới được thêm vào `imports`. */
@Module({
  imports: [
    AppConfigModule,
    // Giới hạn theo IP: đăng ký/đăng nhập (chống dò mật khẩu) và (M11) các đường dẫn công khai.
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [
          {
            name: AUTH_THROTTLER,
            ttl: RATE_LIMIT_WINDOW_MS,
            limit: config.session.authRateLimitPerMinute,
          },
          {
            name: PUBLIC_THROTTLER,
            ttl: RATE_LIMIT_WINDOW_MS,
            limit: config.session.publicRateLimitPerMinute,
            generateKey: publicThrottlerKey,
          },
        ],
        errorMessage: rateLimitMessage,
      }),
    }),
    HealthModule,
    IdentityModule,
    OrganizationsModule,
    ProductsModule,
    ServiceModule,
    InspectionModule,
    TransferModule,
    LifecycleModule,
    NotificationsModule,
    VerificationModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, OriginCheckMiddleware).forRoutes('{*path}');
  }
}
