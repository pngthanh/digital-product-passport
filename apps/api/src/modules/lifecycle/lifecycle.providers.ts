import type { Provider } from '@nestjs/common';
import { CLOCK, SYSTEM_CLOCK } from '../../common/time/clock.js';
import { LIFECYCLE_CHAIN } from './application/ports/lifecycle-chain.port.js';
import { RECALL_REPOSITORY } from './application/ports/recall.repository.js';
import { EthersLifecycleChain } from './infrastructure/ethers-lifecycle.chain.js';
import { PrismaRecallRepository } from './infrastructure/prisma-recall.repository.js';

/** Nối cổng của tầng application với hiện thực infrastructure; dùng cho API và Worker. */
export const LIFECYCLE_PORT_PROVIDERS: Provider[] = [
  { provide: CLOCK, useValue: SYSTEM_CLOCK },
  { provide: RECALL_REPOSITORY, useClass: PrismaRecallRepository },
  { provide: LIFECYCLE_CHAIN, useClass: EthersLifecycleChain },
];
