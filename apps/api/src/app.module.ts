import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { RequestIdMiddleware } from './common/http/request-id.middleware.js';
import { AppConfigModule } from './config/app-config.module.js';
import { HealthModule } from './modules/health/index.js';

/** Module gốc của tiến trình API (HTTP). Mỗi module nghiệp vụ mới được thêm vào `imports`. */
@Module({
  imports: [AppConfigModule, HealthModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('{*path}');
  }
}
