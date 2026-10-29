import { Injectable } from '@nestjs/common';
import {
  DEFAULT_ADMIN_ROLE,
  FEE_ACTION_IDS,
  ORGANIZATION_APPLICATION_TYPES,
  type OrganizationApplication,
  PARTY_REGISTRY_ABI,
  partyRegistryDomain,
} from '@dpp/shared';
import { Contract, Wallet } from 'ethers';
import { AppConfigService } from '../../../config/app-config.service.js';
import { ChainProviderService } from '../../../infrastructure/blockchain/chain-provider.service.js';
import type { OrganizationChain } from '../application/ports/organization-chain.port.js';
import { OrganizationChainNotConfiguredError } from '../domain/organizations.errors.js';

/** Ký giấy phép bằng REGISTRAR_SIGNER_PRIVATE_KEY và đọc hàm view của PartyRegistry qua RPC. */
@Injectable()
export class EthersOrganizationChain implements OrganizationChain {
  readonly chainId: number;
  readonly contractAddress: string | null;
  private readonly signer: Wallet | null;

  constructor(
    private readonly chain: ChainProviderService,
    config: AppConfigService,
  ) {
    const identityChain = config.identityChain;
    this.chainId = config.chain.chainId;
    this.contractAddress = identityChain?.partyRegistryAddress.toLowerCase() ?? null;
    this.signer = identityChain ? new Wallet(identityChain.registrarPrivateKey) : null;
  }

  signApplication(application: OrganizationApplication): Promise<string> {
    if (!this.signer || !this.contractAddress) {
      throw new OrganizationChainNotConfiguredError();
    }
    return this.signer.signTypedData(
      partyRegistryDomain(this.chainId, this.contractAddress),
      ORGANIZATION_APPLICATION_TYPES,
      application,
    );
  }

  async registrationFee(): Promise<bigint> {
    const value = await this.call('feeOf', [FEE_ACTION_IDS.ORG_REGISTRATION]);
    if (typeof value !== 'bigint') {
      throw new Error('feeOf trả về giá trị không hợp lệ');
    }
    return value;
  }

  async hasAdminRole(wallet: string): Promise<boolean> {
    return (await this.call('hasRole', [DEFAULT_ADMIN_ROLE, wallet])) === true;
  }

  private async call(method: string, args: readonly unknown[]): Promise<unknown> {
    const address = this.contractAddress;
    if (!address) {
      throw new OrganizationChainNotConfiguredError();
    }
    const { result } = await this.chain.withFailover(async (provider) => {
      const registry = new Contract(address, PARTY_REGISTRY_ABI, provider);
      const value: unknown = await registry.getFunction(method).staticCall(...args);
      return value;
    });
    return result;
  }
}
