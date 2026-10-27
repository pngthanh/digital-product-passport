import './config/load-env-file.js';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createLogger } from './common/logging/create-logger.js';
import { AppConfigService } from './config/app-config.service.js';
import { WorkerModule } from './worker.module.js';

/** Tiến trình Worker: Indexer đồng bộ event và các job định kỳ, chạy tách khỏi API. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  const config = app.get(AppConfigService);
  app.useLogger(createLogger(config, 'DPP-Worker'));
  app.enableShutdownHooks();

  Logger.log(`Worker đã sẵn sàng trên ${config.chain.network.name}`, 'Bootstrap');
}

await bootstrap();
