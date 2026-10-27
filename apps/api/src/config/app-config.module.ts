import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfigService } from './app-config.service.js';
import { parseEnv } from './env.schema.js';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      // .env đã được nạp bởi load-env-file.ts; ở đây chỉ kiểm tra và đóng băng cấu hình.
      ignoreEnvFile: true,
      validate: parseEnv,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
