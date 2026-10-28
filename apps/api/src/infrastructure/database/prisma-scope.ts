import { Injectable } from '@nestjs/common';
import { TransactionScope, type UnitOfWork } from '../../common/persistence/transaction-scope.js';
import type { Prisma } from './generated/client.js';
import { PrismaService } from './prisma.service.js';

export type PrismaExecutor = PrismaService | Prisma.TransactionClient;

function isPrismaTransaction(handle: object): handle is Prisma.TransactionClient {
  return '$queryRaw' in handle && '$executeRaw' in handle;
}

/** Mở TransactionScope thành Prisma client của giao dịch; không có scope thì dùng client gốc. */
export function prismaFrom(prisma: PrismaService, scope?: TransactionScope): PrismaExecutor {
  if (!scope) {
    return prisma;
  }
  if (!isPrismaTransaction(scope.handle)) {
    throw new Error('TransactionScope không do PrismaUnitOfWork tạo ra');
  }
  return scope.handle;
}

@Injectable()
export class PrismaUnitOfWork implements UnitOfWork {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(work: (scope: TransactionScope) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work(new TransactionScope(tx)));
  }
}
