import { Injectable } from '@nestjs/common';
import { PARTY_REGISTRY_ABI } from '@dpp/shared';
import { Contract, ZeroAddress } from 'ethers';
import { AppConfigService } from '../../../config/app-config.service.js';
import { ChainProviderService } from '../../../infrastructure/blockchain/chain-provider.service.js';
import type { PartyRegistryReader } from '../application/ports/party-registry-reader.port.js';
import { IdentityChainNotConfiguredError } from '../domain/identity.errors.js';

/** Gọi hàm view của PartyRegistry qua RPC (có RPC dự phòng). */
@Injectable()
export class EthersPartyRegistryReader implements PartyRegistryReader {
  private readonly address: string | null;

  constructor(
    private readonly chain: ChainProviderService,
    config: AppConfigService,
  ) {
    this.address = config.partyRegistryAddress;
  }

  async isWalletUsed(wallet: string): Promise<boolean> {
    const result = await this.call('isWalletUsed', [wallet]);
    return result === true;
  }

  async walletOf(chainPartyId: string, atBlock?: bigint): Promise<string | null> {
    const result = await this.call('walletOf', [chainPartyId], atBlock);
    return typeof result === 'string' && result !== ZeroAddress ? result.toLowerCase() : null;
  }

  private async call(method: string, args: readonly unknown[], atBlock?: bigint): Promise<unknown> {
    const address = this.address;
    if (!address) {
      throw new IdentityChainNotConfiguredError();
    }
    const { result } = await this.chain.withFailover(async (provider) => {
      const registry = new Contract(address, PARTY_REGISTRY_ABI, provider);
      const fn = registry.getFunction(method);
      const overrides = atBlock === undefined ? [] : [{ blockTag: atBlock }];
      const value: unknown = await fn.staticCall(...args, ...overrides);
      return value;
    });
    return result;
  }
}
