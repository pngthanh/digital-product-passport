import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfigService } from '../../config/app-config.service.js';
import { PrismaClient } from './generated/client.js';

const CONNECTION_TIMEOUT_MS = 5000;

/**
 * Adapter `pg` gửi DateTime dưới dạng giờ UTC không kèm múi giờ; ép phiên làm việc dùng UTC để
 * PostgreSQL cài với múi giờ máy (ví dụ Asia/Ho_Chi_Minh) không ghi lệch 7 giờ vào cột timestamptz.
 */
export const UTC_SESSION_OPTIONS = '-c TimeZone=UTC';

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
        options: UTC_SESSION_OPTIONS,
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
