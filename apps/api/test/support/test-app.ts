import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureHttpApp } from '../../src/common/http/configure-http-app.js';
import { AppConfigModule } from '../../src/config/app-config.module.js';
import { AppConfigService } from '../../src/config/app-config.service.js';
import { ChainProviderService } from '../../src/infrastructure/blockchain/chain-provider.service.js';
import { ChainSyncWorkerModule } from '../../src/modules/chain-sync/index.js';
import { IdentityWorkerModule } from '../../src/modules/identity/index.js';
import { InspectionWorkerModule } from '../../src/modules/inspection/index.js';
import { OrganizationsWorkerModule } from '../../src/modules/organizations/index.js';
import { ProductsWorkerModule } from '../../src/modules/products/index.js';
import { ServiceWorkerModule } from '../../src/modules/service/index.js';

/** RPC "ngoại tuyến": khớp chain ID khi khởi động, mọi lời gọi khác đều lỗi. */
export function offlineChain(chainId: number) {
  return {
    readChainId: async () => chainId,
    readHead: async () => {
      throw new Error('RPC ngoại tuyến trong test');
    },
    withFailover: async () => {
      throw new Error('RPC ngoại tuyến trong test');
    },
    onModuleDestroy: () => undefined,
  };
}

interface ApiAppOptions {
  /** Thay cấu hình đọc từ .env (ví dụ trỏ RPC tới Hardhat node của test). */
  config?: AppConfigService;
  /** Không truyền thì dùng RPC thật theo cấu hình. */
  chain?: object;
}

/** Dựng API giống hệt main.ts (prefix, cookie, bộ lọc lỗi) trên CSDL test. */
export async function createApiApp(options: ApiAppOptions = {}): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.config) {
    builder = builder.overrideProvider(AppConfigService).useValue(options.config);
  }
  if (options.chain) {
    builder = builder.overrideProvider(ChainProviderService).useValue(options.chain);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureHttpApp(app, app.get(AppConfigService));
  await app.init();
  return app;
}

/** Lấy giá trị cookie phiên từ header Set-Cookie để gửi lại ở request sau. */
export function sessionCookieFrom(setCookie: string[] | string | undefined): string {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const session = cookies.find((cookie) => cookie.startsWith('dpp_session='));
  if (!session) {
    throw new Error('Phản hồi không đặt cookie dpp_session');
  }
  return session.split(';')[0] ?? '';
}

/** Phần Worker cần cho test (không bật ScheduleModule): test tự gọi runOnce() đúng lúc cần. */
export async function createWorkerContext(config: AppConfigService): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      AppConfigModule,
      ChainSyncWorkerModule,
      IdentityWorkerModule,
      OrganizationsWorkerModule,
      ProductsWorkerModule,
      ServiceWorkerModule,
      InspectionWorkerModule,
    ],
  })
    .overrideProvider(AppConfigService)
    .useValue(config)
    .compile();
  return moduleRef.init();
}
