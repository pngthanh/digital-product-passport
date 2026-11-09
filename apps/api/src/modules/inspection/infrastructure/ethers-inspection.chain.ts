import { Injectable } from '@nestjs/common';
import { INSPECTION_RECORD_TYPES, type InspectionRecord, inspectionDomain } from '@dpp/shared';
import { Wallet } from 'ethers';
import { AppConfigService } from '../../../config/app-config.service.js';
import type { InspectionChain } from '../application/ports/inspection-chain.port.js';
import { InspectionChainNotConfiguredError } from '../domain/inspection.errors.js';

/** Ký giấy phép ghi kết quả kiểm định bằng REGISTRAR_SIGNER_PRIVATE_KEY (khoá có REGISTRAR_ROLE). */
@Injectable()
export class EthersInspectionChain implements InspectionChain {
  readonly chainId: number;
  readonly contractAddress: string | null;
  private readonly signer: Wallet | null;

  constructor(config: AppConfigService) {
    const inspectionChain = config.inspectionChain;
    this.chainId = config.chain.chainId;
    this.contractAddress = inspectionChain?.inspectionRegistryAddress.toLowerCase() ?? null;
    this.signer = inspectionChain ? new Wallet(inspectionChain.registrarPrivateKey) : null;
  }

  signRecord(record: InspectionRecord): Promise<string> {
    if (!this.signer || !this.contractAddress) {
      throw new InspectionChainNotConfiguredError();
    }
    return this.signer.signTypedData(
      inspectionDomain(this.chainId, this.contractAddress),
      INSPECTION_RECORD_TYPES,
      record,
    );
  }
}
