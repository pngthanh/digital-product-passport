import type { PrismaClient } from '../../src/infrastructure/database/generated/client.js';
import {
  createSoldProduct,
  createTestPrisma,
  expectConstraintViolation,
  type Fixtures,
  randomAddress,
  randomBytes32,
  resetDatabase,
  SAMPLE_ARGON2ID_HASH,
  seedFixtures,
} from '../support/test-database.js';

const DAY_MS = 86_400_000;

const blockchainEvent = (overrides: Record<string, unknown> = {}) => ({
  chainId: 10143,
  contractAddress: randomAddress(),
  blockNumber: 1_000n,
  blockHash: randomBytes32(),
  blockTimestamp: new Date(),
  txHash: randomBytes32(),
  txIndex: 0,
  logIndex: 0,
  eventName: 'OwnershipTransferred',
  payload: {},
  ...overrides,
});

/*
 * Kiểm chứng các ràng buộc CSDL theo góp ý của giảng viên trên PostgreSQL thật.
 * Mỗi test vi phạm đúng một ràng buộc và kiểm tra tên ràng buộc trong lỗi trả về.
 */
describe('Ràng buộc CSDL', () => {
  let prisma: PrismaClient;
  let fixtures: Fixtures;

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    fixtures = await seedFixtures(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const transferData = (productId: string, chainRequestId: bigint) => ({
    chainRequestId,
    productId,
    fromPartyId: fixtures.ownerPartyId,
    toPartyId: fixtures.receiverPartyId,
    transferState: 'REQUESTED' as const,
    requestedAt: new Date(),
    expiresAt: new Date(Date.now() + DAY_MS),
    createdTxHash: randomBytes32(),
  });

  const productAt = (state: 'AT_RETAIL' | 'SOLD' | 'IN_DISTRIBUTION', owner: string | null) =>
    prisma.product.create({
      data: {
        chainProductId: randomBytes32(),
        serialNumber: `ABC-${state}-${Date.now()}`,
        publicCode: `code${Date.now()}`,
        modelName: 'ABC Pro 14',
        metadataHash: randomBytes32(),
        issuerOrgId: fixtures.manufacturerId,
        productState: state,
        currentCustodianPartyId: fixtures.retailerPartyId,
        currentOwnerPartyId: owner,
      },
    });

  const ownerWallet = (address: string) => ({
    partyId: fixtures.manufacturerPartyId,
    address,
    custodyType: 'NON_CUSTODIAL' as const,
    walletRole: 'OWNER' as const,
    status: 'ACTIVE' as const,
    activatedAt: new Date(),
  });

  describe('Party thay cho FK cứng tới users/organizations', () => {
    it('một Party chỉ trỏ tới đúng một chủ thể, khớp loại', async () => {
      const organization = await prisma.organization.findFirstOrThrow();

      await expectConstraintViolation(
        prisma.party.create({ data: { partyType: 'USER', organizationId: organization.id } }),
        'ck_parties_subject',
      );
    });

    it('owner và custodian đều có thể là tổ chức hoặc cá nhân', async () => {
      const product = await createSoldProduct(prisma, fixtures, 'ABC-2026-000128');
      const updated = await prisma.product.update({
        where: { id: product.id },
        data: {
          currentOwnerPartyId: fixtures.retailerPartyId,
          currentCustodianPartyId: fixtures.retailerPartyId,
        },
      });

      expect(updated.currentOwnerPartyId).toBe(fixtures.retailerPartyId);
    });
  });

  describe('Custody và Ownership tách biệt', () => {
    it('sản phẩm ở kho nhà bán lẻ chưa được có owner', async () => {
      await expectConstraintViolation(
        productAt('AT_RETAIL', fixtures.ownerPartyId),
        'ck_products_owner_matches_state',
      );
    });

    it('sản phẩm SOLD bắt buộc có owner', async () => {
      await expectConstraintViolation(productAt('SOLD', null), 'ck_products_owner_matches_state');
    });

    it('IN_DISTRIBUTION phải có bên nhận custody đang chờ', async () => {
      await expectConstraintViolation(
        productAt('IN_DISTRIBUTION', null),
        'ck_products_pending_custodian',
      );
    });

    it('bản ghi đã CONFIRMED phải có đủ dữ liệu chiếu từ chain', async () => {
      await expectConstraintViolation(
        prisma.product.create({
          data: {
            chainProductId: randomBytes32(),
            serialNumber: 'ABC-2026-000999',
            publicCode: 'pendingcode',
            modelName: 'ABC Pro 14',
            metadataHash: randomBytes32(),
            issuerOrgId: fixtures.manufacturerId,
            syncStatus: 'CONFIRMED',
          },
        }),
        'ck_products_confirmed_projection',
      );
    });
  });

  describe('Mỗi sản phẩm tối đa 1 transfer request đang mở', () => {
    it('chặn request REQUESTED thứ hai cho cùng sản phẩm', async () => {
      const product = await createSoldProduct(prisma, fixtures, 'ABC-2026-000128');
      await prisma.transferRequest.create({ data: transferData(product.id, 1n) });

      await expectConstraintViolation(
        prisma.transferRequest.create({ data: transferData(product.id, 2n) }),
        'ux_transfer_one_active',
      );
    });

    it('cho phép request mới sau khi request cũ đã đóng', async () => {
      const product = await createSoldProduct(prisma, fixtures, 'ABC-2026-000128');
      const first = await prisma.transferRequest.create({ data: transferData(product.id, 1n) });
      await prisma.transferRequest.update({
        where: { id: first.id },
        data: { transferState: 'REJECTED', closedAt: new Date(), closedTxHash: randomBytes32() },
      });

      await expect(
        prisma.transferRequest.create({ data: transferData(product.id, 2n) }),
      ).resolves.toBeDefined();
    });

    it('request đã đóng phải có thời điểm và tx đóng', async () => {
      const product = await createSoldProduct(prisma, fixtures, 'ABC-2026-000128');

      await expectConstraintViolation(
        prisma.transferRequest.create({
          data: { ...transferData(product.id, 1n), transferState: 'COMPLETED' },
        }),
        'ck_transfer_requests_closure',
      );
    });

    it('không chuyển quyền cho chính mình', async () => {
      const product = await createSoldProduct(prisma, fixtures, 'ABC-2026-000128');

      await expectConstraintViolation(
        prisma.transferRequest.create({
          data: { ...transferData(product.id, 1n), toPartyId: fixtures.ownerPartyId },
        }),
        'ck_transfer_requests_distinct_parties',
      );
    });
  });

  describe('Bảo hành và dịch vụ', () => {
    it('mỗi sản phẩm chỉ có một bảo hành hiện hành', async () => {
      const product = await createSoldProduct(prisma, fixtures, 'ABC-2026-000128');
      const warranty = {
        productId: product.id,
        activatedByPartyId: fixtures.retailerPartyId,
        activatedAt: new Date(),
        expiresAt: new Date(Date.now() + 730 * DAY_MS),
        warrantyState: 'ACTIVE' as const,
      };
      await prisma.warranty.create({ data: { ...warranty, activationTxHash: randomBytes32() } });

      await expectConstraintViolation(
        prisma.warranty.create({ data: { ...warranty, activationTxHash: randomBytes32() } }),
        'warranties_product_id_key',
      );
    });

    it('ngày hết hạn phải sau ngày kích hoạt', async () => {
      const product = await createSoldProduct(prisma, fixtures, 'ABC-2026-000128');

      await expectConstraintViolation(
        prisma.warranty.create({
          data: {
            productId: product.id,
            activatedByPartyId: fixtures.retailerPartyId,
            activatedAt: new Date(),
            expiresAt: new Date(Date.now() - DAY_MS),
            warrantyState: 'ACTIVE',
            activationTxHash: randomBytes32(),
          },
        }),
        'ck_warranties_period',
      );
    });

    it('mỗi sản phẩm chỉ có một yêu cầu dịch vụ đang mở', async () => {
      const product = await createSoldProduct(prisma, fixtures, 'ABC-2026-000128');
      const request = {
        productId: product.id,
        requestedByPartyId: fixtures.ownerPartyId,
        serviceCenterOrgId: fixtures.manufacturerId,
        issueDesc: 'Máy không nhận SSD',
      };
      const first = await prisma.serviceRequest.create({ data: request });

      await expectConstraintViolation(
        prisma.serviceRequest.create({ data: request }),
        'ux_service_one_open',
      );

      await prisma.serviceRequest.update({
        where: { id: first.id },
        data: { serviceState: 'CANCELLED', cancelledAt: new Date() },
      });
      await expect(prisma.serviceRequest.create({ data: request })).resolves.toBeDefined();
    });

    it('phiếu IN_REPAIR phải có ticket và tx mở on-chain', async () => {
      const product = await createSoldProduct(prisma, fixtures, 'ABC-2026-000128');

      await expectConstraintViolation(
        prisma.serviceRequest.create({
          data: {
            productId: product.id,
            requestedByPartyId: fixtures.ownerPartyId,
            serviceCenterOrgId: fixtures.manufacturerId,
            issueDesc: 'Thay SSD',
            serviceState: 'IN_REPAIR',
          },
        }),
        'ck_service_requests_state_consistency',
      );
    });
  });

  describe('Chuẩn hoá địa chỉ và hash', () => {
    it('địa chỉ ví phải ở dạng chữ thường', async () => {
      await expectConstraintViolation(
        prisma.partyWallet.create({
          data: {
            partyId: fixtures.ownerPartyId,
            address: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
            custodyType: 'NON_CUSTODIAL',
            walletRole: 'PERSONAL',
          },
        }),
        'ck_party_wallets_address_format',
      );
    });

    it('một địa chỉ ví chỉ thuộc về một Party', async () => {
      const address = randomAddress();
      const wallet = {
        address,
        custodyType: 'CUSTODIAL' as const,
        walletRole: 'PERSONAL' as const,
      };
      await prisma.partyWallet.create({ data: { ...wallet, partyId: fixtures.ownerPartyId } });

      await expectConstraintViolation(
        prisma.partyWallet.create({ data: { ...wallet, partyId: fixtures.receiverPartyId } }),
        'party_wallets_address_key',
      );
    });

    it('mỗi tổ chức chỉ có một ví OWNER đang hoạt động', async () => {
      await prisma.partyWallet.create({ data: ownerWallet(randomAddress()) });

      await expectConstraintViolation(
        prisma.partyWallet.create({ data: ownerWallet(randomAddress()) }),
        'ux_wallet_one_active_owner',
      );
    });
  });

  describe('blockchain_events phục vụ Indexer và kiểm tra reorg', () => {
    it('cùng (chain_id, tx_hash, log_index) chỉ ghi một lần', async () => {
      const first = blockchainEvent();
      await prisma.blockchainEvent.create({ data: first });

      await expectConstraintViolation(
        prisma.blockchainEvent.create({ data: blockchainEvent({ txHash: first.txHash }) }),
        'ux_blockchain_events_identity',
      );
    });

    it('event FINALIZED phải có thời điểm finalized', async () => {
      await expectConstraintViolation(
        prisma.blockchainEvent.create({ data: blockchainEvent({ finalityStatus: 'FINALIZED' }) }),
        'ck_blockchain_events_finality',
      );
    });

    it('tx_hash phải là bytes32 hex chữ thường', async () => {
      await expectConstraintViolation(
        prisma.blockchainEvent.create({
          data: blockchainEvent({ txHash: `0x${'AB'.repeat(32)}` }),
        }),
        'ck_blockchain_events_hash_format',
      );
    });
  });

  describe('Bảo mật và lịch sử', () => {
    it('password_hash phải là chuỗi băm Argon2id', async () => {
      await expectConstraintViolation(
        prisma.user.create({
          data: {
            email: 'bcrypt@example.vn',
            fullName: 'Bcrypt',
            passwordHash: '$2b$12$abcdefghijklmnopqrstuv',
          },
        }),
        'ck_users_password_hash_argon2id',
      );
    });

    it('audit_logs không cho sửa hoặc xoá', async () => {
      await prisma.auditLog.create({
        data: { action: 'ORG_APPROVED', targetType: 'organization' },
      });

      await expectConstraintViolation(
        prisma.auditLog.updateMany({ data: { action: 'ORG_REJECTED' } }),
        'append-only',
      );
      await expectConstraintViolation(prisma.auditLog.deleteMany(), 'append-only');
    });

    it('không xoá được tổ chức đã phát hành sản phẩm (ON DELETE RESTRICT)', async () => {
      const issuer = await prisma.organization.create({
        data: {
          name: 'XYZ Devices',
          taxCode: '0312345678',
          orgType: 'MANUFACTURER',
          contactEmail: 'xyz@example.vn',
        },
      });
      await prisma.product.create({
        data: {
          chainProductId: randomBytes32(),
          serialNumber: 'XYZ-2026-000001',
          publicCode: 'xyzcode001',
          modelName: 'XYZ Air',
          metadataHash: randomBytes32(),
          issuerOrgId: issuer.id,
        },
      });

      await expectConstraintViolation(
        prisma.organization.delete({ where: { id: issuer.id } }),
        'products_issuer_org_id_fkey',
      );
    });

    it('email đăng nhập được lưu chữ thường', async () => {
      await expectConstraintViolation(
        prisma.user.create({
          data: {
            email: 'NguyenVanC@Example.vn',
            fullName: 'C',
            passwordHash: SAMPLE_ARGON2ID_HASH,
          },
        }),
        'ck_users_email_lowercase',
      );
    });
  });
});
