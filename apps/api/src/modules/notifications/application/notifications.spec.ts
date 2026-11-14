import { inMemoryNotifier } from '../../../../test/support/notification-fakes.js';
import { TestClock } from '../../../../test/support/test-config.js';
import type { AuthenticatedUser } from '../../identity/index.js';
import type { OrganizationRef } from '../../organizations/index.js';
import {
  GetNotificationSummary,
  ListMyNotifications,
  MarkNotificationsRead,
} from './notification-queries.js';

const PERSON = '0199a3b2-7c4d-7e8f-9a0b-000000000003';
const SHOP = '0199a3b2-7c4d-7e8f-9a0b-0000000000a2';
const OTHER = '0199a3b2-7c4d-7e8f-9a0b-000000000004';
const MAKER = '0199a3b2-7c4d-7e8f-9a0b-0000000000a1';
const product = {
  id: '0199a3b2-7c4d-7e8f-9a0b-0000000000f1',
  publicCode: 'K7M2PQ9XRT4W',
  serialNumber: 'ABC-2026-000001',
  modelName: 'Laptop ABC Pro 14',
};
const user: AuthenticatedUser = {
  id: 'user-1',
  email: 'nguyen.an@gmail.com',
  fullName: 'Nguyễn Văn An',
  systemRole: 'USER',
};
const MAKER_ORG: OrganizationRef = {
  id: MAKER,
  name: 'Công ty ABC',
  taxCode: '0318765432',
  orgType: 'MANUFACTURER',
  authStatus: 'AUTHORIZED',
  address: null,
  partyId: `0x${'a1'.repeat(32)}`,
};

function setup() {
  const { notifier, notifications } = inMemoryNotifier();
  const recipients = {
    of: async () => [PERSON, SHOP],
    split: async () => ({ personal: PERSON, organization: SHOP }),
  };
  const organizations = {
    describe: async (ids: readonly string[]) =>
      new Map(ids.filter((id) => id === MAKER).map((id) => [id, MAKER_ORG] as const)),
  };
  return {
    notifier,
    notifications,
    list: new ListMyNotifications(notifications, recipients, organizations),
    summary: new GetNotificationSummary(notifications, recipients),
    markRead: new MarkNotificationsRead(notifications, new TestClock(), recipients),
  };
}

describe('Notifications (M10)', () => {
  it('Notifier bỏ người nhận trùng hoặc rỗng; không có người nhận thì không ghi gì', async () => {
    const { notifier, notifications } = setup();
    expect(
      await notifier.notify({
        type: 'PRODUCT_RECALLED',
        recipients: [PERSON, null, PERSON, undefined, SHOP],
        product,
        organizationId: MAKER,
        reason: 'Pin có nguy cơ phồng',
      }),
    ).toBe(2);
    expect(await notifier.notify({ type: 'TRANSFER_ACCEPTED', recipients: [null], product })).toBe(
      0,
    );
    expect(notifications.rows.map((row) => row.recipientPartyId)).toEqual([PERSON, SHOP]);
  });

  it('danh sách gồm thông báo của cá nhân và tổ chức người dùng đại diện, tên tổ chức tra lúc đọc', async () => {
    const { notifier, list } = setup();
    await notifier.notify({
      type: 'PRODUCT_RECALLED',
      recipients: [PERSON],
      product,
      organizationId: MAKER,
      reason: 'Pin có nguy cơ phồng',
    });
    await notifier.notify({ type: 'CUSTODY_DISPATCHED', recipients: [SHOP, OTHER], product });

    const view = await list.execute(user, { page: 1, pageSize: 20 });

    expect(view).toMatchObject({ total: 2, unread: 2 });
    expect(view.items.map((item) => item.type)).toEqual(['CUSTODY_DISPATCHED', 'PRODUCT_RECALLED']);
    expect(view.items[0]?.forOrganization).toBe(true);
    expect(view.items[1]).toMatchObject({
      forOrganization: false,
      organizationName: 'Công ty ABC',
      reason: 'Pin có nguy cơ phồng',
      readAt: null,
      product: { serialNumber: 'ABC-2026-000001' },
    });
  });

  it('đánh dấu đã đọc từng thông báo hoặc tất cả; không đụng thông báo của người khác', async () => {
    const { notifier, notifications, summary, markRead } = setup();
    await notifier.notify({
      type: 'TRANSFER_REQUESTED',
      recipients: [PERSON, SHOP, OTHER],
      product,
    });
    const [first] = notifications.rows;

    expect(await markRead.execute(user, [first!.id])).toEqual({ unread: 1 });
    expect(await markRead.execute(user, null)).toEqual({ unread: 0 });
    expect(await summary.execute(user)).toEqual({ unread: 0 });
    expect(notifications.rows.find((row) => row.recipientPartyId === OTHER)?.readAt).toBeNull();
  });
});
