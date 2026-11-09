import { Injectable } from '@nestjs/common';
import {
  SERVICE_TICKET_OPENING_TYPES,
  type ServiceTicketOpening,
  serviceTicketDomain,
} from '@dpp/shared';
import { Wallet } from 'ethers';
import { AppConfigService } from '../../../config/app-config.service.js';
import type { ServiceTicketChain } from '../application/ports/service-ticket-chain.port.js';
import { ServiceChainNotConfiguredError } from '../domain/service.errors.js';

/** Ký giấy phép mở phiếu bằng REGISTRAR_SIGNER_PRIVATE_KEY (khoá có REGISTRAR_ROLE). */
@Injectable()
export class EthersServiceTicketChain implements ServiceTicketChain {
  readonly chainId: number;
  readonly contractAddress: string | null;
  private readonly signer: Wallet | null;

  constructor(config: AppConfigService) {
    const serviceChain = config.serviceChain;
    this.chainId = config.chain.chainId;
    this.contractAddress = serviceChain?.serviceTicketManagerAddress.toLowerCase() ?? null;
    this.signer = serviceChain ? new Wallet(serviceChain.registrarPrivateKey) : null;
  }

  signOpening(opening: ServiceTicketOpening): Promise<string> {
    if (!this.signer || !this.contractAddress) {
      throw new ServiceChainNotConfiguredError();
    }
    return this.signer.signTypedData(
      serviceTicketDomain(this.chainId, this.contractAddress),
      SERVICE_TICKET_OPENING_TYPES,
      opening,
    );
  }
}
