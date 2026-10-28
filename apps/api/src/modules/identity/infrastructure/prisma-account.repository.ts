import { Injectable } from '@nestjs/common';
import { isUniqueViolation } from '../../../infrastructure/database/prisma-errors.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { User } from '../../../infrastructure/database/generated/client.js';
import type { AccountRepository, NewAccount } from '../application/ports/account.repository.js';
import { EmailAlreadyRegisteredError } from '../domain/identity.errors.js';
import type { UserAccount } from '../domain/user-account.js';

export function toUserAccount(row: User): UserAccount {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    systemRole: row.systemRole,
    status: row.status,
    sessionVersion: row.sessionVersion,
    passwordHash: row.passwordHash,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<UserAccount | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row && toUserAccount(row);
  }

  async findById(userId: string): Promise<UserAccount | null> {
    const row = await this.prisma.user.findUnique({ where: { id: userId } });
    return row && toUserAccount(row);
  }

  async createWithParty(account: NewAccount): Promise<{ account: UserAccount; partyId: string }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: account });
        const party = await tx.party.create({ data: { partyType: 'USER', userId: user.id } });
        return { account: toUserAccount(user), partyId: party.id };
      });
    } catch (error) {
      if (isUniqueViolation(error, 'email')) {
        throw new EmailAlreadyRegisteredError();
      }
      throw error;
    }
  }

  async incrementSessionVersion(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
    });
  }
}
