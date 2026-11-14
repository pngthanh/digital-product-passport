import type { NotificationView } from '@dpp/shared';
import { describe, expect, it } from 'vitest';
import { notificationText } from '../notifications/notification-text';
import { isRecallable, OWNER_ACTION_STATE } from './lifecycle-flows';
import {
  myNotificationsSchema,
  ownedProductLifecycleSchema,
  publicLifecycleSchema,
} from './lifecycle.schema';

const BYTES32 = `0x${'ab'.repeat(32)}`;
const NOTIFICATION: NotificationView = {
  id: '0199a3b2-7c4d-7e8f-9a0b-0000000000f1',
  type: 'PRODUCT_RECALLED',
  createdAt: '2026-11-10T03:00:00.000Z',
  readAt: null,
  product: {
    id: '0199a3b2-7c4d-7e8f-9a0b-0000000000f2',
    publicCode: 'K7M2PQ9XRT4W',
    serialNumber: 'LT14-2611-00001',
    modelName: 'Laptop An Phát 14',
  },
  organizationName: 'Công ty TNHH Điện tử An Phát',
  reason: 'Bộ sạc có thể quá nhiệt.',
  result: null,
  repaired: null,
  forOrganization: false,
};

describe('lifecycle (M10)', () => {
  it('chỉ trạng thái chưa cuối mới thu hồi được; mỗi hàm của chủ đặt đúng trạng thái cuối', () => {
    expect(
      ['CREATED', 'IN_DISTRIBUTION', 'AT_RETAIL', 'SOLD'].every((state) =>
        isRecallable(state as never),
      ),
    ).toBe(true);
    expect(isRecallable('RECALLED')).toBe(false);
    expect(isRecallable('LOST_STOLEN')).toBe(false);
    expect(isRecallable(null)).toBe(false);
    expect(OWNER_ACTION_STATE).toEqual({
      reportLostStolen: 'LOST_STOLEN',
      retireProduct: 'RETIRED',
    });
  });

  it('schema nhận cảnh báo công khai (có hoặc không lý do) và khung của chủ sở hữu', () => {
    expect(
      publicLifecycleSchema.parse({
        notice: {
          state: 'RECALLED',
          at: '2026-11-10T03:00:00.000Z',
          txHash: BYTES32,
          recall: { reason: 'Lỗi pin', reasonHash: BYTES32, issuerName: 'An Phát' },
        },
      }).notice?.recall?.reason,
    ).toBe('Lỗi pin');
    expect(publicLifecycleSchema.parse({ notice: null }).notice).toBeNull();
    expect(() =>
      ownedProductLifecycleSchema.parse({
        notice: null,
        blockedReason: null,
        contract: null,
        wallet: null,
        chainProductId: BYTES32,
        methods: ['reportLostStolen', 'burn'],
      }),
    ).toThrow();
  });

  it('nội dung thông báo dẫn tới đúng trang theo loại và người nhận', () => {
    expect(notificationText(NOTIFICATION, null)).toMatchObject({
      title: 'Sản phẩm bị thu hồi',
      href: '/p/K7M2PQ9XRT4W',
    });
    expect(notificationText(NOTIFICATION, null).body).toContain('Lý do: Bộ sạc có thể quá nhiệt.');
    const inspection = { ...NOTIFICATION, type: 'INSPECTION_RECORDED', result: 'FAIL' } as const;
    expect(notificationText(inspection, null).href).toBe(`/owned/${NOTIFICATION.product.id}`);
    expect(notificationText({ ...inspection, forOrganization: true }, 'MANUFACTURER').href).toBe(
      `/products/${NOTIFICATION.product.id}`,
    );
    expect(notificationText({ ...NOTIFICATION, type: 'CUSTODY_DISPATCHED' }, 'RETAILER').href).toBe(
      '/inventory?filter=INCOMING',
    );
    expect(
      myNotificationsSchema.parse({
        items: [NOTIFICATION],
        total: 1,
        unread: 1,
        page: 1,
        pageSize: 20,
      }).items,
    ).toHaveLength(1);
  });
});
