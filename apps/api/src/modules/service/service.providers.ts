import type { Provider } from '@nestjs/common';
import { CLOCK, SYSTEM_CLOCK } from '../../common/time/clock.js';
import { SERVICE_REQUEST_REPOSITORY } from './application/ports/service-request.repository.js';
import { FILE_STORAGE } from '../../common/files/file-storage.js';
import { LocalFileStorage } from '../../infrastructure/storage/local-file.storage.js';
import { SERVICE_TICKET_CHAIN } from './application/ports/service-ticket-chain.port.js';
import { EthersServiceTicketChain } from './infrastructure/ethers-service-ticket.chain.js';
import { PrismaServiceRequestRepository } from './infrastructure/prisma-service-request.repository.js';
import { SERVICE_STATISTICS } from './application/ports/service-statistics.reader.js';
import { PrismaServiceStatistics } from './infrastructure/prisma-service-statistics.reader.js';

/** Nối cổng của tầng application với hiện thực infrastructure; dùng cho API và Worker. */
export const SERVICE_PORT_PROVIDERS: Provider[] = [
  { provide: SERVICE_STATISTICS, useClass: PrismaServiceStatistics },
  { provide: CLOCK, useValue: SYSTEM_CLOCK },
  { provide: SERVICE_REQUEST_REPOSITORY, useClass: PrismaServiceRequestRepository },
  { provide: SERVICE_TICKET_CHAIN, useClass: EthersServiceTicketChain },
  { provide: FILE_STORAGE, useClass: LocalFileStorage },
];
