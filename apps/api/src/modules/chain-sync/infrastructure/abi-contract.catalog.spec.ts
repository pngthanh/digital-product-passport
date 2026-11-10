import {
  INSPECTION_REGISTRY_ABI,
  OWNERSHIP_TRANSFER_ABI,
  PARTY_REGISTRY_ABI,
  SERVICE_TICKET_MANAGER_ABI,
} from '@dpp/shared';
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
      chainProductId: null,
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

  it('M7: giải mã ServiceTicketClosed, correlation theo ticketId, ghi productId', () => {
    const address = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';
    const service = new AbiContractCatalog(
      createTestConfig({ SERVICE_TICKET_MANAGER_ADDRESS: address }),
    );
    const ticketId = `0x${'1A'.repeat(32)}`;
    const productId = `0x${'2B'.repeat(32)}`;
    const evidenceHash = `0x${'3c'.repeat(32)}`;
    const encoded = new Interface(SERVICE_TICKET_MANAGER_ABI).encodeEventLog(
      'ServiceTicketClosed',
      [ticketId, productId, 2, evidenceHash],
    );

    expect(
      service.decodeLog({ address: address.toLowerCase(), ...encoded, logIndex: 3 }),
    ).toMatchObject({
      contractName: 'ServiceTicketManager',
      eventName: 'ServiceTicketClosed',
      args: { ticketId: ticketId.toLowerCase(), state: 2, evidenceHash },
      correlationKey: ticketId.toLowerCase(),
      chainProductId: productId.toLowerCase(),
    });
    expect(service.indexedContracts().map((contract) => contract.name)).toContain(
      'ServiceTicketManager',
    );
  });

  it('M8: giải mã InspectionRecorded, correlation theo inspectionId, ghi productId', () => {
    const address = '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707';
    const inspections = new AbiContractCatalog(
      createTestConfig({ INSPECTION_REGISTRY_ADDRESS: address }),
    );
    const inspectionId = `0x${'4D'.repeat(32)}`;
    const productId = `0x${'5E'.repeat(32)}`;
    const inspectorId = `0x${'6f'.repeat(32)}`;
    const requesterId = `0x${'70'.repeat(32)}`;
    const reportHash = `0x${'81'.repeat(32)}`;
    const encoded = new Interface(INSPECTION_REGISTRY_ABI).encodeEventLog('InspectionRecorded', [
      inspectionId,
      productId,
      inspectorId,
      requesterId,
      3,
      reportHash,
    ]);

    expect(
      inspections.decodeLog({ address: address.toLowerCase(), ...encoded, logIndex: 0 }),
    ).toMatchObject({
      contractName: 'InspectionRegistry',
      eventName: 'InspectionRecorded',
      args: { inspectionId: inspectionId.toLowerCase(), result: 3, reportHash },
      correlationKey: inspectionId.toLowerCase(),
      chainProductId: productId.toLowerCase(),
    });
  });

  it('M9: requestId (uint256) thành chuỗi thập phân làm correlation, ghi productId', () => {
    const address = '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853';
    const transfers = new AbiContractCatalog(
      createTestConfig({ OWNERSHIP_TRANSFER_ADDRESS: address }),
    );
    const productId = `0x${'5E'.repeat(32)}`;
    const encoded = new Interface(OWNERSHIP_TRANSFER_ABI).encodeEventLog('TransferRequested', [
      12n,
      productId,
      `0x${'6f'.repeat(32)}`,
      `0x${'70'.repeat(32)}`,
      1_900_000_000n,
    ]);

    expect(
      transfers.decodeLog({ address: address.toLowerCase(), ...encoded, logIndex: 0 }),
    ).toMatchObject({
      contractName: 'OwnershipTransfer',
      eventName: 'TransferRequested',
      args: { requestId: '12', expiresAt: '1900000000' },
      correlationKey: '12',
      chainProductId: productId.toLowerCase(),
    });
  });
});
