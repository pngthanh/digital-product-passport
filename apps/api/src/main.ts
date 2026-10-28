import './config/load-env-file.js';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { API_PREFIX, configureHttpApp } from './common/http/configure-http-app.js';
import { createLogger } from './common/logging/create-logger.js';
import { AppConfigService } from './config/app-config.service.js';

/** Tiến trình API: nhận request HTTP từ Web và gửi giao dịch lên blockchain. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(AppConfigService);
  app.useLogger(createLogger(config, 'DPP-API'));
  configureHttpApp(app, config);

  await app.listen(config.apiPort);
  Logger.log(`API đang chạy tại http://localhost:${config.apiPort}/${API_PREFIX}`, 'Bootstrap');
}

await bootstrap();
