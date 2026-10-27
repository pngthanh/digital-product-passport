import { EnvValidationError, parseEnv } from './env.schema.js';

const VALID_ENV = {
  DATABASE_URL: 'postgresql://dpp:secret@localhost:5432/dpp',
  RPC_URL: 'https://testnet-rpc.monad.xyz',
};

describe('parseEnv', () => {
  it('áp giá trị mặc định cho Monad Testnet', () => {
    const env = parseEnv(VALID_ENV);

    expect(env.CHAIN_ID).toBe(10143);
    expect(env.API_PORT).toBe(4000);
    expect(env.RPC_FALLBACK_URL).toBeUndefined();
  });

  it('hiểu chuỗi rỗng là không khai báo RPC dự phòng', () => {
    expect(parseEnv({ ...VALID_ENV, RPC_FALLBACK_URL: '' }).RPC_FALLBACK_URL).toBeUndefined();
  });

  it('ép kiểu số từ chuỗi', () => {
    expect(parseEnv({ ...VALID_ENV, CHAIN_ID: '31337', API_PORT: '8080' })).toMatchObject({
      CHAIN_ID: 31337,
      API_PORT: 8080,
    });
  });

  it('từ chối chain chưa hỗ trợ và liệt kê lỗi', () => {
    expect(() => parseEnv({ ...VALID_ENV, CHAIN_ID: '1' })).toThrow(EnvValidationError);
  });

  it('báo thiếu biến bắt buộc', () => {
    let caught: unknown;
    try {
      parseEnv({});
    } catch (error) {
      caught = error;
    }

    if (!(caught instanceof EnvValidationError)) {
      throw new Error('Mong đợi EnvValidationError');
    }
    expect(caught.issues.join('\n')).toContain('DATABASE_URL');
    expect(caught.issues.join('\n')).toContain('RPC_URL');
  });
});
