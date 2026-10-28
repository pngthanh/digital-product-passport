import { Injectable } from '@nestjs/common';
import { partyRegistryDomain, WALLET_BINDING_TYPES, type WalletBinding } from '@dpp/shared';
import { Wallet } from 'ethers';
import { AppConfigService } from '../../../config/app-config.service.js';
import type { WalletLinkAuthorizer } from '../application/ports/wallet-link-authorizer.port.js';
import { IdentityChainNotConfiguredError } from '../domain/identity.errors.js';

/** Ký giấy phép WalletBinding (EIP-712) bằng REGISTRAR_SIGNER_PRIVATE_KEY. */
@Injectable()
export class Eip712WalletLinkAuthorizer implements WalletLinkAuthorizer {
  readonly contractAddress: string | null;
  readonly chainId: number;
  private readonly signer: Wallet | null;

  constructor(config: AppConfigService) {
    const identityChain = config.identityChain;
    this.chainId = config.chain.chainId;
    this.contractAddress = identityChain?.partyRegistryAddress.toLowerCase() ?? null;
    this.signer = identityChain ? new Wallet(identityChain.registrarPrivateKey) : null;
  }

  /** Địa chỉ cần được cấp REGISTRAR_ROLE trên contract. */
  get registrarAddress(): string | null {
    return this.signer?.address ?? null;
  }

  sign(binding: WalletBinding): Promise<string> {
    if (!this.signer || !this.contractAddress) {
      throw new IdentityChainNotConfiguredError();
    }
    return this.signer.signTypedData(
      partyRegistryDomain(this.chainId, this.contractAddress),
      WALLET_BINDING_TYPES,
      binding,
    );
  }
}
