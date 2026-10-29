import { Injectable } from '@nestjs/common';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import type { PartyWallet } from '../../../infrastructure/database/generated/client.js';
import { isUniqueViolation } from '../../../infrastructure/database/prisma-errors.js';
import { type PrismaExecutor, prismaFrom } from '../../../infrastructure/database/prisma-scope.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type {
  IdentityRecord,
  PartyWalletRepository,
  PendingWalletInput,
  ProjectionResult,
  RegisteredParty,
  RegistrationProjection,
  RotationProjection,
  WalletRecord,
} from '../application/ports/party-wallet.repository.js';
import { WalletAlreadyUsedError, WalletLinkInProgressError } from '../domain/identity.errors.js';
import { toUserAccount } from './prisma-account.repository.js';

const ONE_PENDING_PERSONAL_INDEX = 'ux_wallet_one_pending_personal';

function toWalletRecord(row: PartyWallet): WalletRecord {
  return {
    id: row.id,
    partyId: row.partyId,
    address: row.address,
    custodyType: row.custodyType,
    walletRole: row.walletRole,
    status: row.status,
    activatedAt: row.activatedAt,
    revokedAt: row.revokedAt,
    linkTxHash: row.linkTxHash,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaPartyWalletRepository implements PartyWalletRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findIdentity(userId: string): Promise<IdentityRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { party: { include: { wallets: { orderBy: { createdAt: 'desc' } } } } },
    });
    if (!user?.party) {
      return null;
    }
    const { party } = user;
    return {
      account: toUserAccount(user),
      party: { id: party.id, partyType: party.partyType, chainPartyId: party.chainPartyId },
      wallets: party.wallets.map(toWalletRecord),
    };
  }

  async findByAddress(address: string): Promise<WalletRecord | null> {
    const row = await this.prisma.partyWallet.findUnique({ where: { address } });
    return row && toWalletRecord(row);
  }

  async savePendingPersonalWallet(input: PendingWalletInput): Promise<WalletRecord> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (input.discardPendingId) {
          await tx.partyWallet.deleteMany({
            where: { id: input.discardPendingId, partyId: input.partyId, status: 'PENDING' },
          });
        }
        const row = input.reusePendingId
          ? await tx.partyWallet.update({
              where: { id: input.reusePendingId, partyId: input.partyId, status: 'PENDING' },
              // Giấy phép mới thì giao dịch cũ (nếu đã hỏng) không còn liên quan.
              data: { linkTxHash: null, updatedAt: new Date() },
            })
          : await tx.partyWallet.create({
              data: {
                partyId: input.partyId,
                address: input.address,
                custodyType: 'NON_CUSTODIAL',
                walletRole: 'PERSONAL',
                status: 'PENDING',
              },
            });
        return toWalletRecord(row);
      });
    } catch (error) {
      if (isUniqueViolation(error, ONE_PENDING_PERSONAL_INDEX)) {
        throw new WalletLinkInProgressError();
      }
      if (isUniqueViolation(error, 'address')) {
        throw new WalletAlreadyUsedError();
      }
      throw error;
    }
  }

  async attachLinkTransaction(walletId: string, txHash: string): Promise<WalletRecord> {
    const row = await this.prisma.partyWallet.update({
      where: { id: walletId },
      data: { linkTxHash: txHash },
    });
    return toWalletRecord(row);
  }

  async listStalePending(updatedBefore: Date): Promise<WalletRecord[]> {
    const rows = await this.prisma.partyWallet.findMany({
      where: { status: 'PENDING', walletRole: 'PERSONAL', updatedAt: { lt: updatedBefore } },
    });
    return rows.map(toWalletRecord);
  }

  async deletePending(walletId: string): Promise<void> {
    await this.prisma.partyWallet.deleteMany({ where: { id: walletId, status: 'PENDING' } });
  }

  async listRegisteredParties(
    afterPartyId: string | null,
    limit: number,
  ): Promise<RegisteredParty[]> {
    const parties = await this.prisma.party.findMany({
      where: {
        partyType: 'USER',
        chainPartyId: { not: null },
        ...(afterPartyId ? { id: { gt: afterPartyId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: limit,
      select: {
        id: true,
        chainPartyId: true,
        wallets: {
          where: { status: 'ACTIVE', walletRole: 'PERSONAL' },
          select: { address: true },
        },
      },
    });
    return parties.flatMap((party) =>
      party.chainPartyId
        ? [
            {
              partyId: party.id,
              chainPartyId: party.chainPartyId,
              activeWallet: party.wallets[0]?.address ?? null,
            },
          ]
        : [],
    );
  }

  async applyRegistration(
    projection: RegistrationProjection,
    scope: TransactionScope,
  ): Promise<ProjectionResult | null> {
    const db = prismaFrom(this.prisma, scope);
    const party = await db.party.findUnique({ where: { id: projection.partyId } });
    if (!party) {
      return null;
    }
    if (!party.chainPartyId) {
      await db.party.update({
        where: { id: party.id },
        data: { chainPartyId: projection.chainPartyId },
      });
    }
    const walletId = await this.activate(db, party.id, projection.address, {
      txHash: projection.txHash,
      at: projection.activatedAt,
    });
    return walletId ? { userId: party.userId, walletId } : null;
  }

  async applyRotation(
    projection: RotationProjection,
    scope: TransactionScope,
  ): Promise<ProjectionResult | null> {
    const db = prismaFrom(this.prisma, scope);
    const party = await db.party.findUnique({ where: { id: projection.partyId } });
    if (!party) {
      return null;
    }
    // Ví cũ thôi ACTIVE trước, để chỉ mục "1 ví PERSONAL ACTIVE / Party" không bị vi phạm.
    await db.partyWallet.updateMany({
      where: { partyId: party.id, address: projection.previousAddress, status: 'ACTIVE' },
      data: { status: 'ROTATED', revokedAt: projection.rotatedAt },
    });
    const walletId = await this.activate(db, party.id, projection.newAddress, {
      txHash: projection.txHash,
      at: projection.rotatedAt,
    });
    return walletId ? { userId: party.userId, walletId } : null;
  }

  /** Kích hoạt ví theo event; tạo dòng mới nếu yêu cầu PENDING đã bị dọn trước khi event tới. */
  private async activate(
    db: PrismaExecutor,
    partyId: string,
    address: string,
    link: { txHash: string; at: Date },
  ): Promise<string | null> {
    const existing = await db.partyWallet.findUnique({ where: { address } });
    if (existing && existing.partyId !== partyId) {
      return null;
    }
    const data = { status: 'ACTIVE' as const, activatedAt: link.at, linkTxHash: link.txHash };
    const row = existing
      ? await db.partyWallet.update({ where: { id: existing.id }, data })
      : await db.partyWallet.create({
          data: {
            ...data,
            partyId,
            address,
            custodyType: 'NON_CUSTODIAL',
            walletRole: 'PERSONAL',
          },
        });
    return row.id;
  }
}
