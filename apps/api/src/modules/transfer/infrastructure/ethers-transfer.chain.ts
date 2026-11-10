import { Injectable } from '@nestjs/common';
import {
  TRANSFER_AUTHORIZATION_TYPES,
  type TransferAuthorization,
  transferDomain,
} from '@dpp/shared';
import { Wallet } from 'ethers';
import { AppConfigService } from '../../../config/app-config.service.js';
import type { TransferChain } from '../application/ports/transfer-chain.port.js';
import { TransferChainNotConfiguredError } from '../domain/transfer.errors.js';

/** Ký giấy phép tạo yêu cầu chuyển nhượng bằng REGISTRAR_SIGNER_PRIVATE_KEY (khoá có REGISTRAR_ROLE). */
@Injectable()
export class EthersTransferChain implements TransferChain {
  readonly chainId: number;
  readonly contractAddress: string | null;
  private readonly signer: Wallet | null;

  constructor(config: AppConfigService) {
    const transferChain = config.transferChain;
    this.chainId = config.chain.chainId;
    this.contractAddress = transferChain?.ownershipTransferAddress.toLowerCase() ?? null;
    this.signer = transferChain ? new Wallet(transferChain.registrarPrivateKey) : null;
  }

  signAuthorization(authorization: TransferAuthorization): Promise<string> {
    if (!this.signer || !this.contractAddress) {
      throw new TransferChainNotConfiguredError();
    }
    return this.signer.signTypedData(
      transferDomain(this.chainId, this.contractAddress),
      TRANSFER_AUTHORIZATION_TYPES,
      authorization,
    );
  }
}
