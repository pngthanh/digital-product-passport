import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { OriginCheckMiddleware } from './common/http/origin-check.middleware.js';
import { RequestIdMiddleware } from './common/http/request-id.middleware.js';
import { AppConfigModule } from './config/app-config.module.js';
import { AppConfigService } from './config/app-config.service.js';
import { HealthModule } from './modules/health/index.js';
import { IdentityModule } from './modules/identity/index.js';
import { OrganizationsModule } from './modules/organizations/index.js';

const RATE_LIMIT_WINDOW_MS = 60_000;

/** Module gốc của tiến trình API (HTTP). Mỗi module nghiệp vụ mới được thêm vào `imports`. */
@Module({
  imports: [
    AppConfigModule,
    // Giới hạn số lần thử đăng ký/đăng nhập theo IP, chống dò mật khẩu.
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [{ ttl: RATE_LIMIT_WINDOW_MS, limit: config.session.authRateLimitPerMinute }],
        errorMessage: 'Bạn thử quá nhiều lần. Đợi một phút rồi thử lại.',
      }),
    }),
    HealthModule,
    IdentityModule,
    OrganizationsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, OriginCheckMiddleware).forRoutes('{*path}');
  }
}
