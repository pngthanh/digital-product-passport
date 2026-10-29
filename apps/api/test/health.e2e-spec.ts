import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { REQUEST_ID_HEADER } from '../src/common/http/request-id.middleware.js';
import type { ChainHead } from '../src/infrastructure/blockchain/chain-provider.service.js';
import type { PrismaClient } from '../src/infrastructure/database/generated/client.js';
import { createApiApp } from './support/test-app.js';
import { createTestConfig, TEST_PARTY_REGISTRY } from './support/test-config.js';
import { createTestPrisma } from './support/test-database.js';

const CHAIN_ID = 31337;
const REGISTRY = TEST_PARTY_REGISTRY.toLowerCase();

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
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  const chain = new FakeChainProvider(CHAIN_ID);

  /** Worker đã quét PartyRegistry tới `block`. */
  async function indexedUpTo(block: number) {
    const progress = {
      lastObservedBlock: BigInt(block),
      lastFinalizedBlock: BigInt(block),
      lastFinalizedBlockHash: `0x${'ab'.repeat(32)}`,
    };
    await prisma.indexerCheckpoint.upsert({
      where: { chainId_contractAddress: { chainId: CHAIN_ID, contractAddress: REGISTRY } },
      create: { chainId: CHAIN_ID, contractAddress: REGISTRY, ...progress },
      update: progress,
    });
  }

  beforeAll(async () => {
    prisma = createTestPrisma();
    app = await createApiApp({
      chain,
      config: createTestConfig({
        DATABASE_URL: process.env.DATABASE_URL ?? '',
        CHAIN_ID: String(CHAIN_ID),
        PARTY_REGISTRY_ADDRESS: TEST_PARTY_REGISTRY,
      }),
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    chain.failing = false;
    await prisma.indexerCheckpoint.deleteMany();
  });

  it('GET /api/v1/health trả liveness', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body).toMatchObject({ status: 'ok', service: 'dpp-api' });
  });

  it('GET /api/v1/health/ready báo CSDL, chain và Indexer đều sẵn sàng', async () => {
    await indexedUpTo(1_248);
    const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);

    expect(response.body.status).toBe('up');
    expect(response.body.components.indexer).toMatchObject({
      status: 'up',
      details: {
        trackedContracts: 1,
        indexedBlock: 1_248,
        chainFinalizedBlock: 1_248,
        lagBlocks: 0,
      },
    });
    expect(response.body.components.database.status).toBe('up');
    expect(response.body.components.chain.details).toMatchObject({
      latestBlock: 1_250,
      finalizedBlock: 1_248,
      finalityLagBlocks: 2,
      rpcEndpoint: 'primary',
    });
  });

  it('Indexer chưa chạy hoặc chậm thì báo degraded (vẫn 200), kèm hướng dẫn', async () => {
    const notStarted = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(notStarted.body.status).toBe('degraded');
    expect(notStarted.body.components.indexer.error).toContain('Worker chưa quét PartyRegistry');

    await indexedUpTo(1_000);
    const lagging = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(lagging.body.components.indexer).toMatchObject({
      status: 'degraded',
      details: { lagBlocks: 248 },
    });
    expect(lagging.body.components.indexer.error).toContain('chậm 248 block');
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
