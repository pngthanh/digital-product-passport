import { Module } from '@nestjs/common';
import { UNIT_OF_WORK } from '../../common/persistence/transaction-scope.js';
import { PrismaUnitOfWork } from './prisma-scope.js';
import { PrismaService } from './prisma.service.js';

@Module({
  providers: [PrismaService, { provide: UNIT_OF_WORK, useClass: PrismaUnitOfWork }],
  exports: [PrismaService, UNIT_OF_WORK],
})
export class DatabaseModule {}
