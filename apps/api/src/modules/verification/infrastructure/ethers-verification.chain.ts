import { Injectable } from '@nestjs/common';
import {
  type AuthStatus,
  decodeChainEnum,
  PARTY_REGISTRY_ABI,
  PRODUCT_PASSPORT_ABI,
  toChecksumAddress,
  type VerificationContracts,
  WARRANTY_MANAGER_ABI,
} from '@dpp/shared';
import { Contract, type InterfaceAbi } from 'ethers';
import { AppConfigService } from '../../../config/app-config.service.js';
import { ChainProviderService } from '../../../infrastructure/blockchain/chain-provider.service.js';
import type { VerificationChain } from '../application/ports/verification-chain.port.js';
import type { ChainPassport, WarrantyFacts } from '../domain/verification.js';

const ZERO_PARTY = `0x${'0'.repeat(64)}`;

function isBytes32(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function partyOrNull(value: string): string | null {
  const lower = value.toLowerCase();
  return lower === ZERO_PARTY ? null : lower;
}

function optional(address: string | null): string | null {
  return address ? toChecksumAddress(address) : null;
}

function invalid(method: string): Error {
  return new Error(`${method} trả về giá trị không hợp lệ`);
}

/** `ProductPassport.product()`: (issuerId, metadataHash, custodianId, pendingCustodianId, ownerId, state, warrantyMonths). */
export function parsePassport(value: unknown): ChainPassport {
  if (!Array.isArray(value)) {
    throw invalid('ProductPassport.product()');
  }
  const [issuerId, metadataHash, custodianId, pendingId, ownerId, state, months]: unknown[] = value;
  if (
    !isBytes32(issuerId) ||
    !isBytes32(metadataHash) ||
    !isBytes32(custodianId) ||
    !isBytes32(pendingId) ||
    !isBytes32(ownerId) ||
    typeof state !== 'bigint' ||
    typeof months !== 'bigint'
  ) {
    throw invalid('ProductPassport.product()');
  }
  return {
    issuerPartyId: issuerId.toLowerCase(),
    metadataHash: metadataHash.toLowerCase(),
    productState: decodeChainEnum('ProductState', state),
    warrantyMonths: Number(months),
    custodianPartyId: partyOrNull(custodianId),
    pendingCustodianPartyId: partyOrNull(pendingId),
    ownerPartyId: partyOrNull(ownerId),
  };
}

/** `WarrantyManager.warrantyOf()`: (activatedBy, activatedAt, expiresAt, months, suspended). */
export function parseWarranty(value: unknown): WarrantyFacts | null {
  if (!Array.isArray(value)) {
    throw invalid('WarrantyManager.warrantyOf()');
  }
  const [activatedBy, activatedAt, expiresAt, , suspended]: unknown[] = value;
  if (
    !isBytes32(activatedBy) ||
    typeof activatedAt !== 'bigint' ||
    typeof expiresAt !== 'bigint' ||
    typeof suspended !== 'boolean'
  ) {
    throw invalid('WarrantyManager.warrantyOf()');
  }
  return activatedAt === 0n
    ? null
    : {
        activatedByPartyId: activatedBy.toLowerCase(),
        activatedAt: new Date(Number(activatedAt) * 1000),
        expiresAt: new Date(Number(expiresAt) * 1000),
        suspended,
      };
}

/** `PartyRegistry.organization()`: (representativeId, status, role, profileHash). */
export function parseOrganizationStatus(value: unknown): AuthStatus | null {
  if (!Array.isArray(value)) {
    throw invalid('PartyRegistry.organization()');
  }
  const status: unknown = value[1];
  if (typeof status !== 'bigint') {
    throw invalid('PartyRegistry.organization()');
  }
  return decodeChainEnum('OrganizationStatus', status);
}

/** Đọc hàm view qua RPC có dự phòng, luôn kèm `blockTag` của mốc đã chốt. */
@Injectable()
export class EthersVerificationChain implements VerificationChain {
  private readonly addresses: VerificationContracts | null;

  constructor(
    private readonly chain: ChainProviderService,
    config: AppConfigService,
  ) {
    const productPassport = config.productPassportAddress;
    const partyRegistry = config.partyRegistryAddress;
    this.addresses =
      productPassport && partyRegistry
        ? {
            chainId: config.chain.chainId,
            productPassport: toChecksumAddress(productPassport),
            partyRegistry: toChecksumAddress(partyRegistry),
            warrantyManager: optional(config.warrantyManagerAddress),
            serviceTicketManager: optional(config.serviceTicketManagerAddress),
            inspectionRegistry: optional(config.inspectionRegistryAddress),
            ownershipTransfer: optional(config.ownershipTransferAddress),
            productLifecycle: optional(config.productLifecycleAddress),
          }
        : null;
  }

  contracts(): VerificationContracts | null {
    return this.addresses;
  }

  async readPassport(chainProductId: string, block: bigint): Promise<ChainPassport> {
    const value = await this.call(
      this.required().productPassport,
      PRODUCT_PASSPORT_ABI,
      'product',
      [chainProductId],
      block,
    );
    return parsePassport(value);
  }

  async readWarranty(chainProductId: string, block: bigint): Promise<WarrantyFacts | null> {
    const address = this.required().warrantyManager;
    if (!address) {
      throw new Error('Chưa cấu hình WARRANTY_MANAGER_ADDRESS');
    }
    const value = await this.call(
      address,
      WARRANTY_MANAGER_ABI,
      'warrantyOf',
      [chainProductId],
      block,
    );
    return parseWarranty(value);
  }

  async readOrganizationStatus(chainPartyId: string, block: bigint): Promise<AuthStatus | null> {
    const value = await this.call(
      this.required().partyRegistry,
      PARTY_REGISTRY_ABI,
      'organization',
      [chainPartyId],
      block,
    );
    return parseOrganizationStatus(value);
  }

  private required(): VerificationContracts {
    if (!this.addresses) {
      throw new Error('Chưa cấu hình PRODUCT_PASSPORT_ADDRESS hoặc PARTY_REGISTRY_ADDRESS');
    }
    return this.addresses;
  }

  private async call(
    address: string,
    abi: InterfaceAbi,
    method: string,
    args: readonly string[],
    block: bigint,
  ): Promise<unknown> {
    const { result } = await this.chain.withFailover(async (provider) => {
      const contract = new Contract(address, abi, provider);
      const value: unknown = await contract.getFunction(method).staticCall(...args, {
        blockTag: block,
      });
      return value;
    });
    return result;
  }
}
