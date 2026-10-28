import { SiweMessage } from 'siwe';
import { buildSiweMessage, SIWE_STATEMENTS, type SiweFields } from './siwe-message.js';

const fields: SiweFields = {
  domain: 'localhost:3000',
  address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  statement: SIWE_STATEMENTS.LINK,
  uri: 'http://localhost:3000',
  chainId: 10143,
  nonce: 'a1b2c3d4e5f60718',
  issuedAt: '2026-10-28T08:00:00.000Z',
  expirationTime: '2026-10-28T08:05:00.000Z',
};

describe('buildSiweMessage (EIP-4361)', () => {
  it('đúng bố cục dòng của chuẩn', () => {
    expect(buildSiweMessage(fields)).toBe(
      [
        'localhost:3000 wants you to sign in with your Ethereum account:',
        '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        '',
        'Link this wallet to your Digital Product Passport account.',
        '',
        'URI: http://localhost:3000',
        'Version: 1',
        'Chain ID: 10143',
        'Nonce: a1b2c3d4e5f60718',
        'Issued At: 2026-10-28T08:00:00.000Z',
        'Expiration Time: 2026-10-28T08:05:00.000Z',
      ].join('\n'),
    );
  });

  it('parser SIWE độc lập (thư viện siwe) đọc lại đúng từng trường', () => {
    const parsed = new SiweMessage(buildSiweMessage(fields));

    expect(parsed).toMatchObject({
      domain: fields.domain,
      address: fields.address,
      statement: fields.statement,
      uri: fields.uri,
      version: '1',
      chainId: fields.chainId,
      nonce: fields.nonce,
      issuedAt: fields.issuedAt,
      expirationTime: fields.expirationTime,
    });
  });

  it('statement của mọi mục đích chỉ gồm ký tự ASCII như chuẩn yêu cầu', () => {
    for (const statement of Object.values(SIWE_STATEMENTS)) {
      expect(statement).toMatch(/^[\x20-\x7E]+$/);
    }
  });
});
