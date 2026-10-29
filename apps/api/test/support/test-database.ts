import { PrismaPg } from '@prisma/adapter-pg';
import { randomBytes, randomInt } from 'node:crypto';
import { PrismaClient } from '../../src/infrastructure/database/generated/client.js';
import { UTC_SESSION_OPTIONS } from '../../src/infrastructure/database/prisma.service.js';

/** Thứ tự không quan trọng vì dùng TRUNCATE … CASCADE. */
const ALL_TABLES = [
  'users',
  'organizations',
  'organization_applications',
  'parties',
  'party_wallets',
  'fee_policies',
  'fee_payments',
  'products',
  'custody_records',
  'ownership_records',
  'warranties',
  'service_requests',
  'service_records',
  'inspections',
  'recalls',
  'transfer_requests',
  'notifications',
  'audit_logs',
  'anomaly_alerts',
  'chain_transactions',
  'blockchain_events',
  'indexer_checkpoints',
] as const;

export const SAMPLE_ARGON2ID_HASH = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaGhhc2hoYXNo';

export function createTestPrisma(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      options: UTC_SESSION_OPTIONS,
    }),
  });
}

export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${ALL_TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`,
  );
}

export function randomBytes32(): string {
  return `0x${randomBytes(32).toString('hex')}`;
}

export function randomAddress(): string {
  return `0x${randomBytes(20).toString('hex')}`;
}

const PUBLIC_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Mã QR công khai hợp lệ (12 ký tự, khớp ck_products_public_code_format). */
export function randomPublicCode(): string {
  return Array.from(randomBytes(12), (byte) => PUBLIC_CODE_CHARS[byte % 32]).join('');
}

/** Cột hồ sơ bắt buộc của products từ M5. */
export const PRODUCT_PROFILE = { manufacturedOn: new Date('2026-10-01'), warrantyMonths: 24 };

export function randomTaxCode(): string {
  return String(randomInt(1_000_000_000, 9_999_999_999));
}

/** Bắt lỗi CSDL và kiểm tra tên ràng buộc bị vi phạm có xuất hiện trong lỗi. */
export async function expectConstraintViolation(
  operation: Promise<unknown>,
  constraintName: string,
): Promise<void> {
  try {
    await operation;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const meta = typeof error === 'object' && error !== null && 'meta' in error ? error.meta : {};
    expect(`${message} ${JSON.stringify(meta)}`).toContain(constraintName);
    return;
  }
  throw new Error(`Mong đợi vi phạm "${constraintName}" nhưng thao tác lại thành công`);
}

export interface Fixtures {
  manufacturerId: string;
  manufacturerPartyId: string;
  retailerPartyId: string;
  ownerPartyId: string;
  receiverPartyId: string;
}

/** Tài khoản đại diện cho một tổ chức trong dữ liệu test. */
export function createRepresentative(prisma: PrismaClient, label: string) {
  return prisma.user.create({
    data: {
      email: `dai-dien-${label}-${randomInt(1_000_000)}@example.vn`,
      fullName: `Đại diện ${label}`,
      passwordHash: SAMPLE_ARGON2ID_HASH,
    },
  });
}

/** Dữ liệu nền: một nhà sản xuất, một nhà bán lẻ và hai người dùng cá nhân. */
export async function seedFixtures(prisma: PrismaClient): Promise<Fixtures> {
  const createOrganizationParty = async (orgType: 'MANUFACTURER' | 'RETAILER', name: string) => {
    const representative = await createRepresentative(prisma, orgType.toLowerCase());
    const organization = await prisma.organization.create({
      data: {
        name,
        taxCode: randomTaxCode(),
        orgType,
        contactEmail: `${orgType.toLowerCase()}@example.vn`,
        representativeUserId: representative.id,
      },
    });
    const party = await prisma.party.create({
      data: { partyType: 'ORGANIZATION', organizationId: organization.id },
    });
    return { organization, party };
  };

  const createUserParty = async (email: string, fullName: string) => {
    const user = await prisma.user.create({
      data: { email, fullName, passwordHash: SAMPLE_ARGON2ID_HASH },
    });
    return prisma.party.create({ data: { partyType: 'USER', userId: user.id } });
  };

  const manufacturer = await createOrganizationParty('MANUFACTURER', 'ABC Electronics');
  const retailer = await createOrganizationParty('RETAILER', 'ABC Store Cần Thơ');
  const owner = await createUserParty('nguyenvana@example.vn', 'Nguyễn Văn A');
  const receiver = await createUserParty('tranthib@example.vn', 'Trần Thị B');

  return {
    manufacturerId: manufacturer.organization.id,
    manufacturerPartyId: manufacturer.party.id,
    retailerPartyId: retailer.party.id,
    ownerPartyId: owner.id,
    receiverPartyId: receiver.id,
  };
}

/** Sản phẩm đã xác nhận on-chain ở trạng thái SOLD (owner = A, custody theo owner). */
export async function createSoldProduct(prisma: PrismaClient, fixtures: Fixtures, serial: string) {
  return prisma.product.create({
    data: {
      chainProductId: randomBytes32(),
      serialNumber: serial,
      publicCode: randomPublicCode(),
      ...PRODUCT_PROFILE,
      modelName: 'ABC Pro 14',
      metadataHash: randomBytes32(),
      issuerOrgId: fixtures.manufacturerId,
      productState: 'SOLD',
      currentCustodianPartyId: fixtures.ownerPartyId,
      currentOwnerPartyId: fixtures.ownerPartyId,
      createdTxHash: randomBytes32(),
      syncStatus: 'CONFIRMED',
      onchainCreatedAt: new Date(),
    },
  });
}
