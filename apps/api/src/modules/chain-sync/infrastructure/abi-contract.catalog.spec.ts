import { PARTY_REGISTRY_ABI } from '@dpp/shared';
import { Interface } from 'ethers';
import { createTestConfig, TEST_PARTY_REGISTRY } from '../../../../test/support/test-config.js';
import { AbiContractCatalog } from './abi-contract.catalog.js';

const registry = new Interface(PARTY_REGISTRY_ABI);
const PARTY_ID = `0x${'0'.repeat(32)}${'AB'.repeat(16)}`;
const WALLET = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

describe('AbiContractCatalog', () => {
  const catalog = new AbiContractCatalog(createTestConfig());

  it('giải mã PartyRegistered: chuẩn hoá chữ thường, enum dạng số, correlation theo partyId', () => {
    const encoded = registry.encodeEventLog('PartyRegistered', [PARTY_ID, 1, WALLET]);

    expect(
      catalog.decodeLog({
        address: TEST_PARTY_REGISTRY.toLowerCase(),
        topics: encoded.topics,
        data: encoded.data,
        logIndex: 0,
      }),
    ).toEqual({
      contractName: 'PartyRegistry',
      contractAddress: TEST_PARTY_REGISTRY.toLowerCase(),
      eventName: 'PartyRegistered',
      args: { partyId: PARTY_ID.toLowerCase(), kind: 1, wallet: WALLET.toLowerCase() },
      correlationKey: PARTY_ID.toLowerCase(),
    });
  });

  it('bỏ qua log của contract không theo dõi', () => {
    const encoded = registry.encodeEventLog('PartyRegistered', [PARTY_ID, 1, WALLET]);

    expect(
      catalog.decodeLog({ address: WALLET.toLowerCase(), ...encoded, logIndex: 0 }),
    ).toBeNull();
  });

  it('nhận ra hàm được gọi từ calldata', () => {
    const data = registry.encodeFunctionData('registerUser', [PARTY_ID, 1_900_000_000n, '0x']);

    expect(catalog.decodeMethod('PartyRegistry', data)).toBe('registerUser');
    expect(catalog.decodeMethod('PartyRegistry', '0x12345678')).toBeNull();
    expect(catalog.addressOf('PartyRegistry')).toBe(TEST_PARTY_REGISTRY.toLowerCase());
  });
});
