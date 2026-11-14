import type { TransferRequestView } from '@dpp/shared';
import { describe, expect, it } from 'vitest';
import { transferActionsFor } from './transfer-flows';
import { myTransfersSchema, transferAuthorizationSchema } from './transfer.schema';

const BYTES32 = `0x${'ab'.repeat(32)}`;
const ADDRESS = '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707';

const REQUEST: TransferRequestView = {
  id: '019a0000-0000-7000-8000-0000000000f1',
  requestId: '3',
  state: 'REQUESTED',
  expired: false,
  productUnavailable: false,
  direction: 'INCOMING',
  from: { kind: 'PERSON', fullName: 'Trần Thị B', maskedEmail: 'b***@example.com', isYou: false },
  to: {
    kind: 'ORGANIZATION',
    organizationId: '019a0000-0000-7000-8000-00000000d002',
    name: 'Cửa hàng Bình Minh',
    taxCode: '0312345678',
    isYou: true,
  },
  product: {
    id: '019a0000-0000-7000-8000-0000000000a1',
    publicCode: 'ABCD2345EFGH',
    serialNumber: 'SN-0001',
    modelName: 'Máy lọc nước',
    chainProductId: BYTES32,
    issuer: {
      organizationId: '019a0000-0000-7000-8000-00000000d001',
      name: 'Nhà sản xuất A',
      partyId: BYTES32,
    },
  },
  requestedAt: '2026-11-08T03:00:00.000Z',
  expiresAt: '2026-11-15T03:00:00.000Z',
  closedAt: null,
  createdTxHash: BYTES32,
  closedTxHash: null,
};

describe('dữ liệu chuyển nhượng từ API', () => {
  it('nhận danh sách có bên nhận là doanh nghiệp', () => {
    const parsed = myTransfersSchema.parse({
      contract: { chainId: 10143, address: ADDRESS },
      wallet: ADDRESS.toLowerCase(),
      items: [REQUEST],
      total: 1,
      page: 1,
      pageSize: 20,
      counts: { INCOMING: 1, OUTGOING: 0, CLOSED: 0 },
    });
    expect(parsed.items[0]?.to.kind).toBe('ORGANIZATION');
  });

  it('chặn giấy phép có hạn hoặc requestId không phải số', () => {
    const permit = {
      method: 'createTransferRequest',
      chainId: 10143,
      contractAddress: ADDRESS,
      wallet: ADDRESS,
      productId: BYTES32,
      fromPartyId: BYTES32,
      toPartyId: BYTES32,
      expiresAt: '1900000000',
      deadline: '1890000000',
      signature: '0x1234',
      recipient: REQUEST.from,
    };
    expect(transferAuthorizationSchema.safeParse(permit).success).toBe(true);
    expect(transferAuthorizationSchema.safeParse({ ...permit, expiresAt: '-1' }).success).toBe(
      false,
    );
    expect(
      myTransfersSchema.safeParse({
        contract: null,
        wallet: null,
        items: [{ ...REQUEST, requestId: 'x' }],
        total: 1,
        page: 1,
        pageSize: 20,
        counts: { INCOMING: 1, OUTGOING: 0, CLOSED: 0 },
      }).success,
    ).toBe(false);
  });
});

describe('nút thao tác theo vai và hạn', () => {
  it('bên nhận chấp nhận hoặc từ chối, bên gửi chỉ huỷ', () => {
    expect(transferActionsFor(REQUEST)).toEqual(['acceptTransfer', 'rejectTransfer']);
    expect(transferActionsFor({ ...REQUEST, direction: 'OUTGOING' })).toEqual(['cancelTransfer']);
  });

  it('quá hạn chỉ còn đóng yêu cầu, đã đóng thì không còn nút', () => {
    expect(transferActionsFor({ ...REQUEST, expired: true })).toEqual(['expireTransfer']);
    expect(transferActionsFor({ ...REQUEST, state: 'COMPLETED' })).toEqual([]);
  });

  it('(M10) sản phẩm đã thu hồi, báo mất: bên nhận không chấp nhận được, bên gửi chỉ huỷ', () => {
    const unavailable = { ...REQUEST, productUnavailable: true };
    expect(transferActionsFor(unavailable)).toEqual([]);
    expect(transferActionsFor({ ...unavailable, direction: 'OUTGOING' })).toEqual([
      'cancelTransfer',
    ]);
  });
});
