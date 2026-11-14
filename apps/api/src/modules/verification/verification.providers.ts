import type { Provider } from '@nestjs/common';
import { CLOCK, SYSTEM_CLOCK } from '../../common/time/clock.js';
import { VERIFICATION_CHAIN } from './application/ports/verification-chain.port.js';
import { EthersVerificationChain } from './infrastructure/ethers-verification.chain.js';

/** Nối cổng của tầng application với hiện thực infrastructure. */
export const VERIFICATION_PORT_PROVIDERS: Provider[] = [
  { provide: CLOCK, useValue: SYSTEM_CLOCK },
  { provide: VERIFICATION_CHAIN, useClass: EthersVerificationChain },
];
