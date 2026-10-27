import { Module } from '@nestjs/common';
import { ChainIdVerifier } from './chain-id.verifier.js';
import { ChainProviderService } from './chain-provider.service.js';

@Module({
  providers: [ChainProviderService, ChainIdVerifier],
  exports: [ChainProviderService],
})
export class BlockchainModule {}
