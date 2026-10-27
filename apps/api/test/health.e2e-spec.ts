import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureHttpApp } from '../src/common/http/configure-http-app.js';
import { REQUEST_ID_HEADER } from '../src/common/http/request-id.middleware.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { parseEnv } from '../src/config/env.schema.js';
import {
  type ChainHead,
  ChainProviderService,
} from '../src/infrastructure/blockchain/chain-provider.service.js';

/** RPC giả lập để test không phụ thuộc mạng; CSDL là PostgreSQL test thật. */
class FakeChainProvider {
  failing = false;

  constructor(private readonly chainId: number) {}

  async readChainId(): Promise<number> {
    return this.chainId;
  }

  async readHead(): Promise<ChainHead> {
    if (this.failing) {
      throw new Error('connect ECONNREFUSED 127.0.0.1:8545');
    }
    return {
      chainId: this.chainId,
      latestBlock: 1_250,
      finalizedBlock: 1_248,
      endpoint: 'primary',
    };
  }
}

describe('Health API (e2e)', () => {
  let app: INestApplication;
  const chain = new FakeChainProvider(parseEnv(process.env).CHAIN_ID);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ChainProviderService)
      .useValue(chain)
      .compile();
    app = moduleRef.createNestApplication();
    configureHttpApp(app, app.get(AppConfigService));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    chain.failing = false;
  });

  it('GET /api/v1/health trả liveness', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body).toMatchObject({ status: 'ok', service: 'dpp-api' });
  });

  it('GET /api/v1/health/ready báo CSDL và chain đều sẵn sàng', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);

    expect(response.body.status).toBe('up');
    expect(response.body.components.database.status).toBe('up');
    expect(response.body.components.chain.details).toMatchObject({
      latestBlock: 1_250,
      finalizedBlock: 1_248,
      finalityLagBlocks: 2,
      rpcEndpoint: 'primary',
    });
  });

  it('trả 503 khi RPC không liên lạc được', async () => {
    chain.failing = true;

    const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);

    expect(response.body.status).toBe('down');
    expect(response.body.components.chain.error).toContain('ECONNREFUSED');
  });

  it('lỗi trả về theo định dạng chung và kèm mã yêu cầu', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/khong-ton-tai')
      .set(REQUEST_ID_HEADER, 'test-request-1')
      .expect(404);

    expect(response.headers[REQUEST_ID_HEADER]).toBe('test-request-1');
    expect(response.body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      path: '/api/v1/khong-ton-tai',
      requestId: 'test-request-1',
    });
  });
});
