import type { Provider } from '@nestjs/common';
import { CLOCK, SYSTEM_CLOCK } from '../../common/time/clock.js';
import { PRODUCT_CHAIN, PUBLIC_CODE_GENERATOR } from './application/ports/product-chain.port.js';
import { PRODUCT_REPOSITORY } from './application/ports/product.repository.js';
import {
  CryptoPublicCodeGenerator,
  EthersProductChain,
} from './infrastructure/ethers-product.chain.js';
import { PrismaProductRepository } from './infrastructure/prisma-product.repository.js';

/** Nối cổng của tầng application với hiện thực infrastructure; dùng cho API và Worker. */
export const PRODUCT_PORT_PROVIDERS: Provider[] = [
  { provide: CLOCK, useValue: SYSTEM_CLOCK },
  { provide: PRODUCT_REPOSITORY, useClass: PrismaProductRepository },
  { provide: PRODUCT_CHAIN, useClass: EthersProductChain },
  { provide: PUBLIC_CODE_GENERATOR, useClass: CryptoPublicCodeGenerator },
];
