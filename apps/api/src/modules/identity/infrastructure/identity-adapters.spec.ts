import { partyRegistryDomain, WALLET_BINDING_TYPES, type WalletBinding } from '@dpp/shared';
import { verifyTypedData, Wallet, ZeroAddress } from 'ethers';
import {
  createTestConfig,
  TEST_PARTY_REGISTRY,
  TEST_REGISTRAR_KEY,
  TestClock,
} from '../../../../test/support/test-config.js';
import { IdentityChainNotConfiguredError } from '../domain/identity.errors.js';
import { Argon2PasswordHasher } from './argon2-password.hasher.js';
import { Eip712WalletLinkAuthorizer } from './eip712-wallet-link.authorizer.js';
import { JoseSessionTokens } from './jose-session.tokens.js';
import { JoseWalletChallengeTokens } from './jose-wallet-challenge.tokens.js';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('băm bằng Argon2id với tham số OWASP và salt ngẫu nhiên', async () => {
    const first = await hasher.hash('mat khau dai');
    const second = await hasher.hash('mat khau dai');

    expect(first).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$/);
    expect(first).not.toBe(second);
  });

  it('xác minh đúng/sai và không ném lỗi với chuỗi băm hỏng', async () => {
    const hash = await hasher.hash('mat khau dai');

    expect(await hasher.verify(hash, 'mat khau dai')).toBe(true);
    expect(await hasher.verify(hash, 'mat khau sai')).toBe(false);
    expect(await hasher.verify('khong-phai-argon2', 'mat khau dai')).toBe(false);
    await expect(hasher.verifyDummy('bat ky')).resolves.toBeUndefined();
  });
});

describe('JWT phiên đăng nhập', () => {
  const config = createTestConfig({ SESSION_TTL_MINUTES: '60' });

  it('cấp và xác minh lại đúng userId, session_version', async () => {
    const tokens = new JoseSessionTokens(config, new TestClock());
    const { token, expiresAt } = await tokens.issue({ userId: 'user-1', sessionVersion: 3 });

    expect(expiresAt.toISOString()).toBe('2026-10-28T09:00:00.000Z');
    expect(await tokens.verify(token)).toEqual({ userId: 'user-1', sessionVersion: 3 });
  });

  it('từ chối token hết hạn, bị sửa hoặc ký bằng khoá khác', async () => {
    const clock = new TestClock();
    const tokens = new JoseSessionTokens(config, clock);
    const { token } = await tokens.issue({ userId: 'user-1', sessionVersion: 0 });
    const other = new JoseSessionTokens(
      createTestConfig({ JWT_SECRET: 'another-secret-that-is-32-characters-long' }),
      clock,
    );

    expect(await other.verify(token)).toBeNull();
    expect(await tokens.verify(`${token.slice(0, -2)}xx`)).toBeNull();
    clock.advance(61 * 60_000);
    expect(await tokens.verify(token)).toBeNull();
  });

  it('token challenge liên kết ví không dùng thay token phiên được', async () => {
    const clock = new TestClock();
    const challengeToken = await new JoseWalletChallengeTokens(config, clock).issue({
      userId: 'user-1',
      address: '0x1111111111111111111111111111111111111111',
      purpose: 'LINK',
      nonce: 'a1b2c3d4e5f60718',
      issuedAt: '2026-10-28T08:00:00.000Z',
      expirationTime: '2026-10-28T08:05:00.000Z',
    });

    expect(await new JoseSessionTokens(config, clock).verify(challengeToken)).toBeNull();
  });
});

describe('JWT challenge liên kết ví', () => {
  const config = createTestConfig();
  const claims = {
    userId: 'user-1',
    address: '0x1111111111111111111111111111111111111111',
    purpose: 'ROTATE' as const,
    nonce: 'a1b2c3d4e5f60718',
    issuedAt: '2026-10-28T08:00:00.000Z',
    expirationTime: '2026-10-28T08:05:00.000Z',
  };

  it('giữ nguyên mọi trường để dựng lại thông điệp EIP-4361', async () => {
    const tokens = new JoseWalletChallengeTokens(config, new TestClock());

    expect(await tokens.verify(await tokens.issue(claims))).toEqual(claims);
  });

  it('hết hiệu lực sau Expiration Time của thông điệp', async () => {
    const clock = new TestClock();
    const tokens = new JoseWalletChallengeTokens(config, clock);
    const token = await tokens.issue(claims);
    clock.advance(5 * 60_000 + 1_000);

    expect(await tokens.verify(token)).toBeNull();
  });
});

describe('Eip712WalletLinkAuthorizer', () => {
  const binding: WalletBinding = {
    partyId: `0x${'0'.repeat(32)}${'12'.repeat(16)}`,
    wallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    previousWallet: ZeroAddress,
    deadline: 1_900_000_000n,
  };

  it('ký bằng khoá registrar, đúng domain EIP-712 của PartyRegistry', async () => {
    const authorizer = new Eip712WalletLinkAuthorizer(createTestConfig());
    const signature = await authorizer.sign(binding);

    expect(
      verifyTypedData(
        partyRegistryDomain(31337, TEST_PARTY_REGISTRY),
        WALLET_BINDING_TYPES,
        binding,
        signature,
      ),
    ).toBe(new Wallet(TEST_REGISTRAR_KEY).address);
    expect(authorizer.registrarAddress).toBe(new Wallet(TEST_REGISTRAR_KEY).address);
  });

  it('báo chưa cấu hình khi thiếu khoá ký', () => {
    const authorizer = new Eip712WalletLinkAuthorizer(
      createTestConfig({ REGISTRAR_SIGNER_PRIVATE_KEY: '' }),
    );

    expect(authorizer.contractAddress).toBeNull();
    expect(() => authorizer.sign(binding)).toThrow(IdentityChainNotConfiguredError);
  });
});
