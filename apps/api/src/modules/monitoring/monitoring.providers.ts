import type { Provider } from '@nestjs/common';
import { CLOCK, SYSTEM_CLOCK } from '../../common/time/clock.js';
import { CHAIN_HEAD_READER } from './application/ports/chain-head.reader.js';
import { EthersChainHeadReader } from './infrastructure/ethers-chain-head.reader.js';

/** Nối cổng của tầng application với hiện thực infrastructure. */
export const MONITORING_PORT_PROVIDERS: Provider[] = [
  { provide: CLOCK, useValue: SYSTEM_CLOCK },
  { provide: CHAIN_HEAD_READER, useClass: EthersChainHeadReader },
];
