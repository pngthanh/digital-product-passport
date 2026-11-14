import type { Provider } from '@nestjs/common';
import { FILE_STORAGE } from '../../common/files/file-storage.js';
import { CLOCK, SYSTEM_CLOCK } from '../../common/time/clock.js';
import { LocalFileStorage } from '../../infrastructure/storage/local-file.storage.js';
import { INSPECTION_CHAIN } from './application/ports/inspection-chain.port.js';
import { INSPECTION_REQUEST_REPOSITORY } from './application/ports/inspection-request.repository.js';
import { EthersInspectionChain } from './infrastructure/ethers-inspection.chain.js';
import { PrismaInspectionRequestRepository } from './infrastructure/prisma-inspection-request.repository.js';
import { INSPECTION_STATISTICS } from './application/ports/inspection-statistics.reader.js';
import { PrismaInspectionStatistics } from './infrastructure/prisma-inspection-statistics.reader.js';

/** Nối cổng của tầng application với hiện thực infrastructure; dùng cho API và Worker. */
export const INSPECTION_PORT_PROVIDERS: Provider[] = [
  { provide: INSPECTION_STATISTICS, useClass: PrismaInspectionStatistics },
  { provide: CLOCK, useValue: SYSTEM_CLOCK },
  { provide: INSPECTION_REQUEST_REPOSITORY, useClass: PrismaInspectionRequestRepository },
  { provide: INSPECTION_CHAIN, useClass: EthersInspectionChain },
  { provide: FILE_STORAGE, useClass: LocalFileStorage },
];
