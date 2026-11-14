import { Injectable } from '@nestjs/common';
import { lifecycleDomain, RECALL_AUTHORIZATION_TYPES, type RecallAuthorization } from '@dpp/shared';
import { Wallet } from 'ethers';
import { AppConfigService } from '../../../config/app-config.service.js';
import type { LifecycleChain } from '../application/ports/lifecycle-chain.port.js';
import { LifecycleChainNotConfiguredError } from '../domain/lifecycle.errors.js';

/** Ký giấy phép thu hồi bằng REGISTRAR_SIGNER_PRIVATE_KEY (khoá có REGISTRAR_ROLE). */
@Injectable()
export class EthersLifecycleChain implements LifecycleChain {
  readonly chainId: number;
  readonly contractAddress: string | null;
  private readonly signer: Wallet | null;

  constructor(config: AppConfigService) {
    const lifecycleChain = config.lifecycleChain;
    this.chainId = config.chain.chainId;
    this.contractAddress = lifecycleChain?.productLifecycleAddress.toLowerCase() ?? null;
    this.signer = lifecycleChain ? new Wallet(lifecycleChain.registrarPrivateKey) : null;
  }

  signRecall(authorization: RecallAuthorization): Promise<string> {
    if (!this.signer || !this.contractAddress) {
      throw new LifecycleChainNotConfiguredError();
    }
    return this.signer.signTypedData(
      lifecycleDomain(this.chainId, this.contractAddress),
      RECALL_AUTHORIZATION_TYPES,
      authorization,
    );
  }
}
