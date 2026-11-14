import {
  partyIdFromUuid,
  SERVICE_CENTER_ROLE,
  SERVICE_CONTRACT_ROLE,
  SERVICE_TICKET_OPENING_TYPES,
  type ServiceTicketOpening,
  serviceTicketDomain,
  serviceTicketOpeningDigest,
} from '@dpp/shared';
import { expect } from 'chai';
import { type BaseWallet, id, type Signer, Wallet, ZeroHash } from 'ethers';
import { network } from 'hardhat';
import { BUYER_PARTY, passportFixture, SHOP } from '../support/passport-fixture.js';

const connection = await network.create();
const { ethers, networkHelpers } = connection;
const deployPassport = passportFixture(connection);

const DAVE_PARTY = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-000000000004');
const CENTER = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000c3');
const TICKET = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000d1');
const TICKET_2 = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000d2');
const EVIDENCE = id('bien ban thay SSD');
const TICKET_STATE = { NONE: 0n, IN_REPAIR: 1n, REPAIRED: 2n, REJECTED: 3n } as const;
const WARRANTY = { NONE: 0n, ACTIVE: 1n, SUSPENDED: 2n, EXPIRED: 3n } as const;

/**
 * Fixture M6 cộng thêm: Dave đại diện trung tâm bảo hành CENTER đã duyệt, ServiceTicketManager
 * có SERVICE_CONTRACT_ROLE, một sản phẩm 24 tháng đã bán cho BUYER_PARTY.
 */
async function deployService() {
  const fixture = await deployPassport();
  const { registry, passport, warranty, admin, bob, dave, registrar } = fixture;
  await fixture.registerUser(dave, DAVE_PARTY);
  await fixture.organization(dave, DAVE_PARTY, CENTER, SERVICE_CENTER_ROLE, true);
  const service = await ethers.deployContract('ServiceTicketManager', [
    await registry.getAddress(),
    await passport.getAddress(),
    await warranty.getAddress(),
  ]);
  await registry.connect(admin).grantRole(SERVICE_CONTRACT_ROLE, await service.getAddress());
  const domain = serviceTicketDomain(fixture.chainId, await service.getAddress());

  async function sold(serial = 'ABC-2026-000001', months = 24): Promise<string> {
    const productId = await fixture.atRetail(serial, months);
    await fixture.sell(bob, await fixture.authorizeSale({ productId }));
    return productId;
  }

  async function authorizeOpening(
    overrides: Partial<ServiceTicketOpening> & Pick<ServiceTicketOpening, 'productId'>,
    signer: BaseWallet = registrar,
  ): Promise<ServiceTicketOpening & { signature: string }> {
    const opening: ServiceTicketOpening = {
      ticketId: TICKET,
      serviceCenterId: CENTER,
      requesterId: BUYER_PARTY,
      deadline: await fixture.deadline(),
      ...overrides,
    };
    const signature = await signer.signTypedData(domain, SERVICE_TICKET_OPENING_TYPES, opening);
    return { ...opening, signature };
  }

  function open(wallet: Signer, opening: ServiceTicketOpening & { signature: string }) {
    return service
      .connect(wallet)
      .openTicket(
        opening.ticketId,
        opening.productId,
        opening.requesterId,
        opening.deadline,
        opening.signature,
      );
  }

  return { ...fixture, service, sold, authorizeOpening, open };
}

describe('ServiceTicketManager – mở phiếu sửa (SVC-03)', () => {
  it('trung tâm đã duyệt mở phiếu khi còn bảo hành: tạm dừng bảo hành, phát event', async () => {
    const { service, warranty, dave, sold, authorizeOpening, open } =
      await networkHelpers.loadFixture(deployService);
    const productId = await sold();

    await expect(open(dave, await authorizeOpening({ productId })))
      .to.emit(service, 'ServiceTicketOpened')
      .withArgs(TICKET, productId, CENTER, BUYER_PARTY, true)
      .and.to.emit(warranty, 'WarrantySuspended')
      .withArgs(productId);

    const ticket = await service.ticket(TICKET);
    expect(ticket.state).to.equal(TICKET_STATE.IN_REPAIR);
    expect(ticket.warrantyCovered).to.equal(true);
    expect(await service.openTicketOf(productId)).to.equal(TICKET);
    expect(await warranty.effectiveWarrantyState(productId)).to.equal(WARRANTY.SUSPENDED);
  });

  it('sản phẩm không bảo hành vẫn mở được, ghi ngoài bảo hành và không gọi WarrantyManager', async () => {
    const { service, warranty, dave, sold, authorizeOpening, open } =
      await networkHelpers.loadFixture(deployService);
    const productId = await sold('ABC-2026-000009', 0);

    await expect(open(dave, await authorizeOpening({ productId })))
      .to.emit(service, 'ServiceTicketOpened')
      .withArgs(TICKET, productId, CENTER, BUYER_PARTY, false)
      .and.not.to.emit(warranty, 'WarrantySuspended');
  });

  it('bảo hành đã hết hạn thì mở phiếu ngoài bảo hành', async () => {
    const { service, warranty, dave, sold, authorizeOpening, open } =
      await networkHelpers.loadFixture(deployService);
    const productId = await sold();
    await networkHelpers.time.increaseTo((await warranty.warrantyOf(productId)).expiresAt);

    await expect(open(dave, await authorizeOpening({ productId })))
      .to.emit(service, 'ServiceTicketOpened')
      .withArgs(TICKET, productId, CENTER, BUYER_PARTY, false);
  });

  it('chỉ ví đại diện trung tâm bảo hành đã duyệt mới mở được', async () => {
    const { service, bob, sold, authorizeOpening, open } =
      await networkHelpers.loadFixture(deployService);
    const productId = await sold();

    await expect(open(bob, await authorizeOpening({ productId })))
      .to.be.revertedWithCustomError(service, 'NotAuthorizedServiceCenter')
      .withArgs(bob.address);
  });

  it('giấy phép phải do registrar ký, đúng trung tâm, còn hạn', async () => {
    const { service, dave, sold, authorizeOpening, open } =
      await networkHelpers.loadFixture(deployService);
    const productId = await sold();

    await expect(
      open(dave, await authorizeOpening({ productId }, Wallet.createRandom())),
    ).to.be.revertedWithCustomError(service, 'InvalidAuthorization');
    // Giấy phép cấp cho trung tâm khác thì digest lệch với trung tâm của ví gọi.
    await expect(
      open(dave, await authorizeOpening({ productId, serviceCenterId: SHOP })),
    ).to.be.revertedWithCustomError(service, 'InvalidAuthorization');
    const expired = await authorizeOpening({ productId });
    await networkHelpers.time.increaseTo(expired.deadline + 1n);
    await expect(open(dave, expired))
      .to.be.revertedWithCustomError(service, 'AuthorizationExpired')
      .withArgs(expired.deadline);
  });

  it('người yêu cầu phải là chủ sở hữu hiện tại, sản phẩm phải đã bán', async () => {
    const { service, dave, sold, atRetail, authorizeOpening, open } =
      await networkHelpers.loadFixture(deployService);
    const productId = await sold();
    const stranger = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000e9');

    await expect(open(dave, await authorizeOpening({ productId, requesterId: stranger })))
      .to.be.revertedWithCustomError(service, 'RequesterNotOwner')
      .withArgs(productId, stranger);
    const unsold = await atRetail('ABC-2026-000002');
    await expect(open(dave, await authorizeOpening({ productId: unsold })))
      .to.be.revertedWithCustomError(service, 'ProductNotOwned')
      .withArgs(unsold, 3n);
  });

  it('mỗi sản phẩm tối đa một phiếu mở; mỗi ticketId chỉ dùng một lần (giấy phép không dùng lại được)', async () => {
    const { service, dave, sold, authorizeOpening, open } =
      await networkHelpers.loadFixture(deployService);
    const productId = await sold();
    const first = await authorizeOpening({ productId });
    await open(dave, first);

    await expect(open(dave, await authorizeOpening({ productId, ticketId: TICKET_2 })))
      .to.be.revertedWithCustomError(service, 'ProductHasOpenTicket')
      .withArgs(productId, TICKET);
    await service.connect(dave).closeTicket(TICKET, true, EVIDENCE);
    await expect(open(dave, first))
      .to.be.revertedWithCustomError(service, 'TicketAlreadyExists')
      .withArgs(TICKET);
  });

  it('digest của contract khớp hàm tính ở @dpp/shared', async () => {
    const { service, chainId } = await networkHelpers.loadFixture(deployService);
    const opening = {
      ticketId: TICKET,
      productId: id('san pham'),
      serviceCenterId: CENTER,
      requesterId: BUYER_PARTY,
      deadline: 123n,
    };

    expect(
      await service.serviceTicketOpeningDigest(
        opening.ticketId,
        opening.productId,
        opening.serviceCenterId,
        opening.requesterId,
        opening.deadline,
      ),
    ).to.equal(serviceTicketOpeningDigest(chainId, await service.getAddress(), opening));
  });
});

describe('ServiceTicketManager – đóng phiếu (SVC-04)', () => {
  it('đã sửa: ghi hash biên bản, tiếp tục bảo hành, sản phẩm mở được phiếu mới', async () => {
    const { service, warranty, dave, sold, authorizeOpening, open } =
      await networkHelpers.loadFixture(deployService);
    const productId = await sold();
    await open(dave, await authorizeOpening({ productId }));

    await expect(service.connect(dave).closeTicket(TICKET, true, EVIDENCE))
      .to.emit(service, 'ServiceTicketClosed')
      .withArgs(TICKET, productId, TICKET_STATE.REPAIRED, EVIDENCE)
      .and.to.emit(warranty, 'WarrantyResumed')
      .withArgs(productId);

    const ticket = await service.ticket(TICKET);
    expect(ticket.evidenceHash).to.equal(EVIDENCE);
    expect(ticket.closedAt).to.be.greaterThan(0n);
    expect(await service.openTicketOf(productId)).to.equal(ZeroHash);
    expect(await warranty.effectiveWarrantyState(productId)).to.equal(WARRANTY.ACTIVE);
  });

  it('không sửa được thì REJECTED; phiếu ngoài bảo hành không gọi WarrantyManager', async () => {
    const { service, warranty, dave, sold, authorizeOpening, open } =
      await networkHelpers.loadFixture(deployService);
    const productId = await sold('ABC-2026-000009', 0);
    await open(dave, await authorizeOpening({ productId }));

    await expect(service.connect(dave).closeTicket(TICKET, false, EVIDENCE))
      .to.emit(service, 'ServiceTicketClosed')
      .withArgs(TICKET, productId, TICKET_STATE.REJECTED, EVIDENCE)
      .and.not.to.emit(warranty, 'WarrantyResumed');
  });

  it('hết hạn trong lúc sửa: đóng phiếu vẫn được, bảo hành là EXPIRED', async () => {
    const { service, warranty, dave, sold, authorizeOpening, open } =
      await networkHelpers.loadFixture(deployService);
    const productId = await sold();
    await open(dave, await authorizeOpening({ productId }));
    await networkHelpers.time.increaseTo((await warranty.warrantyOf(productId)).expiresAt);

    await service.connect(dave).closeTicket(TICKET, true, EVIDENCE);
    expect(await warranty.effectiveWarrantyState(productId)).to.equal(WARRANTY.EXPIRED);
  });

  it('chỉ trung tâm đã mở phiếu mới đóng được; phiếu đã đóng không đóng lại; cần hash biên bản', async () => {
    const { service, organization, carol, dave, sold, authorizeOpening, open } =
      await networkHelpers.loadFixture(deployService);
    const productId = await sold();
    await open(dave, await authorizeOpening({ productId }));
    const carolParty = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-000000000003');
    const otherCenter = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000c4');
    await organization(carol, carolParty, otherCenter, SERVICE_CENTER_ROLE, true);

    await expect(
      service.connect(dave).closeTicket(TICKET, true, ZeroHash),
    ).to.be.revertedWithCustomError(service, 'ZeroBytes32');
    await expect(service.connect(carol).closeTicket(TICKET, true, EVIDENCE))
      .to.be.revertedWithCustomError(service, 'NotTicketServiceCenter')
      .withArgs(TICKET, otherCenter);
    await service.connect(dave).closeTicket(TICKET, true, EVIDENCE);
    await expect(service.connect(dave).closeTicket(TICKET, true, EVIDENCE))
      .to.be.revertedWithCustomError(service, 'TicketNotOpen')
      .withArgs(TICKET);
  });

  it('Mục 21.2: Admin khoá trung tâm sau khi đã ghi phiếu: phiếu cũ còn nguyên, không mở phiếu mới được', async () => {
    const { registry, service, admin, dave, sold, authorizeOpening, open } =
      await networkHelpers.loadFixture(deployService);
    const productId = await sold();
    await open(dave, await authorizeOpening({ productId }));
    await service.connect(dave).closeTicket(TICKET, true, EVIDENCE);

    await registry.connect(admin).disableOrganization(CENTER, id('vi pham quy trinh'));

    const ticket = await service.ticket(TICKET);
    expect(ticket.state).to.equal(TICKET_STATE.REPAIRED);
    expect(ticket.serviceCenterId).to.equal(CENTER);
    expect(ticket.evidenceHash).to.equal(EVIDENCE);
    await expect(open(dave, await authorizeOpening({ productId, ticketId: TICKET_2 })))
      .to.be.revertedWithCustomError(service, 'NotAuthorizedServiceCenter')
      .withArgs(dave.address);
  });

  it('thiếu SERVICE_CONTRACT_ROLE thì không tạm dừng được bảo hành', async () => {
    const { registry, service, admin, dave, sold, authorizeOpening, open, warranty } =
      await networkHelpers.loadFixture(deployService);
    const productId = await sold();
    await registry.connect(admin).revokeRole(SERVICE_CONTRACT_ROLE, await service.getAddress());

    await expect(open(dave, await authorizeOpening({ productId }))).to.be.revertedWithCustomError(
      warranty,
      'CallerNotAuthorized',
    );
  });
});
