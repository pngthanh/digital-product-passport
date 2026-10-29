import { Injectable } from '@nestjs/common';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import { prismaFrom } from '../../../infrastructure/database/prisma-scope.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type {
  PartyDirectoryRepository,
  PartySummary,
  PersonSummary,
  UserSummary,
} from '../application/ports/party-directory.repository.js';

@Injectable()
export class PrismaPartyDirectoryRepository implements PartyDirectoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async describeUsers(userIds: readonly string[]): Promise<UserSummary[]> {
    if (userIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, fullName: true, email: true },
    });
    return rows.map((row) => ({ userId: row.id, fullName: row.fullName, email: row.email }));
  }

  async findPersonByEmail(email: string): Promise<PersonSummary | null> {
    const row = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, fullName: true, email: true, party: { select: { id: true } } },
    });
    return row?.party
      ? { userId: row.id, fullName: row.fullName, email: row.email, partyId: row.party.id }
      : null;
  }

  async describeParties(partyIds: readonly string[]): Promise<PartySummary[]> {
    if (partyIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.party.findMany({
      where: { id: { in: [...partyIds] } },
      select: { id: true, partyType: true, userId: true },
    });
    return rows.map((row) => ({ partyId: row.id, kind: row.partyType, userId: row.userId }));
  }

  async createOrganizationParty(organizationId: string, scope: TransactionScope): Promise<void> {
    await prismaFrom(this.prisma, scope).party.create({
      data: { id: organizationId, partyType: 'ORGANIZATION', organizationId },
    });
  }

  async markOrganizationRegistered(
    partyId: string,
    chainPartyId: string,
    scope: TransactionScope,
  ): Promise<boolean> {
    const { count } = await prismaFrom(this.prisma, scope).party.updateMany({
      where: { id: partyId, partyType: 'ORGANIZATION' },
      data: { chainPartyId },
    });
    return count === 1;
  }
}
