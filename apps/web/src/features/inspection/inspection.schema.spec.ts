import { describe, expect, it } from 'vitest';
import { publicInspectionsSchema, recordAuthorizationSchema } from './inspection.schema';

const BYTES32 = `0x${'ab'.repeat(32)}`;
const ADDRESS = '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707';

describe('dữ liệu kiểm định từ API', () => {
  it('nhận kết quả công khai hợp lệ', () => {
    const parsed = publicInspectionsSchema.parse({
      items: [
        {
          id: '019a0000-0000-7000-8000-0000000000e1',
          inspectionId: BYTES32,
          inspector: {
            organizationId: '019a0000-0000-7000-8000-00000000d001',
            name: 'Quatest 3',
            partyId: BYTES32,
          },
          requesterRole: 'OWNER',
          result: 'CONDITIONAL',
          summary: 'Đạt có điều kiện',
          fileType: 'application/pdf',
          reportHash: BYTES32,
          inspectedAt: '2026-11-07T03:00:00.000Z',
          txHash: BYTES32,
          matchesOnchain: true,
        },
      ],
    });
    expect(parsed.items[0]?.result).toBe('CONDITIONAL');
  });

  it('chặn giấy phép có mã kết quả ngoài enum on-chain', () => {
    const permit = {
      method: 'recordInspection',
      chainId: 10143,
      contractAddress: ADDRESS,
      wallet: ADDRESS,
      inspectionId: BYTES32,
      productId: BYTES32,
      inspectorId: BYTES32,
      requesterId: BYTES32,
      result: 'PASS',
      resultCode: 1,
      reportHash: BYTES32,
      deadline: '1900000000',
      signature: '0x1234',
    };
    expect(recordAuthorizationSchema.safeParse(permit).success).toBe(true);
    expect(recordAuthorizationSchema.safeParse({ ...permit, resultCode: 0 }).success).toBe(false);
    expect(recordAuthorizationSchema.safeParse({ ...permit, result: 'NONE' }).success).toBe(false);
  });
});
