import type { Provider } from '@nestjs/common';
import { CLOCK, SYSTEM_CLOCK } from '../../common/time/clock.js';
import { FEE_LEDGER_REPOSITORY } from './application/ports/fee-ledger.repository.js';
import { ORGANIZATION_CHAIN } from './application/ports/organization-chain.port.js';
import { ORGANIZATION_REPOSITORY } from './application/ports/organization.repository.js';
import { EthersOrganizationChain } from './infrastructure/ethers-organization.chain.js';
import { PrismaFeeLedgerRepository } from './infrastructure/prisma-fee-ledger.repository.js';
import { PrismaOrganizationRepository } from './infrastructure/prisma-organization.repository.js';

/** Nối cổng của tầng application với hiện thực infrastructure; dùng cho API và Worker. */
export const ORGANIZATION_PORT_PROVIDERS: Provider[] = [
  { provide: CLOCK, useValue: SYSTEM_CLOCK },
  { provide: ORGANIZATION_REPOSITORY, useClass: PrismaOrganizationRepository },
  { provide: FEE_LEDGER_REPOSITORY, useClass: PrismaFeeLedgerRepository },
  { provide: ORGANIZATION_CHAIN, useClass: EthersOrganizationChain },
];
