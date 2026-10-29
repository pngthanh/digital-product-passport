import { Injectable } from '@nestjs/common';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import { prismaFrom } from '../../../infrastructure/database/prisma-scope.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type {
  PartyDirectoryRepository,
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
