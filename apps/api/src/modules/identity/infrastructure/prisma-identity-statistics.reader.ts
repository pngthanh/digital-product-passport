import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type {
  AccountStatistics,
  IdentityStatistics,
} from '../application/ports/identity-statistics.reader.js';

@Injectable()
export class PrismaIdentityStatistics implements IdentityStatistics {
  constructor(private readonly prisma: PrismaService) {}

  async accounts(): Promise<AccountStatistics> {
    const [total, admins, withWallet] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { systemRole: 'ADMIN' } }),
      this.prisma.party.count({
        where: { partyType: 'USER', wallets: { some: { status: 'ACTIVE' } } },
      }),
    ]);
    return { total, admins, withWallet };
  }
}
