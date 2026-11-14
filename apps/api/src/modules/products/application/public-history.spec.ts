import { type ChainEventView, partyIdFromUuid, toChecksumAddress } from '@dpp/shared';
import { describe, expect, it } from 'vitest';
import { InMemoryIdentityStore } from '../../../../test/support/identity-fakes.js';
import { InMemoryOrganizations } from '../../../../test/support/organization-fakes.js';
import { IdentityDirectory } from '../../identity/application/identity-directory.service.js';
import { OrganizationDirectory } from '../../organizations/application/organization-directory.service.js';
import { PublicHistory } from './public-history.js';

const SHOP_WALLET = '0x1111111111111111111111111111111111111111';
const BUYER_WALLET = '0x2222222222222222222222222222222222222222';
const PRODUCT_ID = `0x${'ab'.repeat(32)}`;

function event(
  eventName: string,
  txHash: string,
  actorAddress: string,
  args: ChainEventView['args'],
): ChainEventView {
  return {
    eventName,
    txHash,
    blockNumber: '10',
    logIndex: 0,
    blockTimestamp: '2026-11-14T05:00:00.000Z',
    actorAddress: toChecksumAddress(actorAddress),
    args: { productId: PRODUCT_ID, ...args },
  };
}

async function setup() {
  const store = new InMemoryIdentityStore();
  const organizations = new InMemoryOrganizations();
  const { account: shopUser } = await store.createWithParty({
    email: 'daidien@cuahang.vn',
    passwordHash: 'x',
    fullName: 'Chị Lan',
  });
  const { account: buyer, partyId: buyerPartyId } = await store.createWithParty({
    email: 'khach.hang@gmail.com',
    passwordHash: 'x',
    fullName: 'Anh Minh',
  });
  store.seedWallet(shopUser.id, SHOP_WALLET, 'ACTIVE');
  store.seedWallet(buyer.id, BUYER_WALLET, 'ACTIVE');
  const shop = await organizations.createDraft({
    representativeUserId: shopUser.id,
    name: 'Siêu thị Điện máy Sao Mai',
    taxCode: '0312345678',
    orgType: 'RETAILER',
    contactEmail: shopUser.email,
    contactPhone: null,
    address: '1 Lê Lợi, Quận 1, TP. Hồ Chí Minh',
    profileHash: `0x${'aa'.repeat(32)}`,
  });
  await store.createOrganizationParty(shop.id);
  const history = new PublicHistory(
    new IdentityDirectory(store, store),
    new OrganizationDirectory(organizations),
  );
  return {
    history,
    shopParty: partyIdFromUuid(shop.id),
    buyerParty: partyIdFromUuid(buyerPartyId),
  };
}

describe('VER-02 lịch sử công khai không lộ người dùng cá nhân (D85)', () => {
  it('bán hàng: giữ ví người đại diện nhà bán lẻ, bỏ mã bên của người mua', async () => {
    const { history, shopParty, buyerParty } = await setup();

    const [sold, state] = await history.present([
      event('OwnershipTransferred', '0xaa', SHOP_WALLET, {
        fromPartyId: shopParty,
        toPartyId: buyerParty,
      }),
      event('ProductStateChanged', '0xaa', SHOP_WALLET, { previousState: 3, newState: 4 }),
    ]);

    expect(sold?.actorAddress).toBe(toChecksumAddress(SHOP_WALLET));
    expect(sold?.args).toEqual({ productId: PRODUCT_ID, fromPartyId: shopParty });
    // Event không nhắc bên nào vẫn giữ ví vì cùng giao dịch nhà bán lẻ ký.
    expect(state?.actorAddress).toBe(toChecksumAddress(SHOP_WALLET));
    expect(state?.args).toEqual({ productId: PRODUCT_ID, previousState: 3, newState: 4 });
  });

  it('người mua tự báo mất hoặc chuyển nhượng: ẩn ví và mã bên của họ', async () => {
    const { history, buyerParty } = await setup();

    const [lost] = await history.present([
      event('ProductReportedLostStolen', '0xbb', BUYER_WALLET, { ownerId: buyerParty }),
    ]);

    expect(lost?.actorAddress).toBeNull();
    expect(lost?.args).toEqual({ productId: PRODUCT_ID });
  });

  it('người đại diện ký giao dịch không nhắc tới doanh nghiệp của họ (mua cho cá nhân): ẩn ví', async () => {
    const { history, buyerParty } = await setup();

    const [transfer] = await history.present([
      event('TransferAccepted', '0xcc', SHOP_WALLET, {
        fromPartyId: buyerParty,
        toPartyId: buyerParty,
      }),
    ]);

    expect(transfer?.actorAddress).toBeNull();
    expect(transfer?.args).toEqual({ productId: PRODUCT_ID });
  });
});
