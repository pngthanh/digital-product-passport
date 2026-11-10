import type { Provider } from '@nestjs/common';
import { CLOCK, SYSTEM_CLOCK } from '../../common/time/clock.js';
import { TRANSFER_CHAIN } from './application/ports/transfer-chain.port.js';
import { TRANSFER_REQUEST_REPOSITORY } from './application/ports/transfer-request.repository.js';
import { EthersTransferChain } from './infrastructure/ethers-transfer.chain.js';
import { PrismaTransferRequestRepository } from './infrastructure/prisma-transfer-request.repository.js';

/** Nối cổng của tầng application với hiện thực infrastructure; dùng cho API và Worker. */
export const TRANSFER_PORT_PROVIDERS: Provider[] = [
  { provide: CLOCK, useValue: SYSTEM_CLOCK },
  { provide: TRANSFER_REQUEST_REPOSITORY, useClass: PrismaTransferRequestRepository },
  { provide: TRANSFER_CHAIN, useClass: EthersTransferChain },
];
