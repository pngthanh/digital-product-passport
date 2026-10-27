import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfigService } from '../../config/app-config.service.js';
import { PrismaClient } from './generated/client.js';

const CONNECTION_TIMEOUT_MS = 5000;

/**
 * Prisma Client dùng driver adapter `pg` (Prisma 7, không cần query engine Rust).
 * Kết nối được mở khi có truy vấn đầu tiên, nên API vẫn khởi động để báo trạng thái khi CSDL tạm ngừng.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: AppConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.databaseUrl,
        connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
