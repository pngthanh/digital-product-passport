import { ConsoleLogger } from '@nestjs/common';
import type { AppConfigService } from '../../config/app-config.service.js';

/** Logger dạng chữ khi phát triển, dạng JSON khi production để gom log dễ dàng. */
export function createLogger(config: AppConfigService, prefix: string): ConsoleLogger {
  return new ConsoleLogger({
    prefix,
    json: config.isProduction,
    logLevels: config.logLevels,
  });
}
