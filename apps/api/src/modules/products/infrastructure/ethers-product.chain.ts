import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  PRODUCT_PASSPORT_ABI,
  PRODUCT_REGISTRATION_TYPES,
  PRODUCT_SALE_TYPES,
  type ProductRegistration,
  type ProductSale,
  productPassportDomain,
  PUBLIC_CODE_ALPHABET,
  PUBLIC_CODE_LENGTH,
} from '@dpp/shared';
import { Contract, Wallet } from 'ethers';
import { AppConfigService } from '../../../config/app-config.service.js';
import { ChainProviderService } from '../../../infrastructure/blockchain/chain-provider.service.js';
import type {
  OnchainProduct,
  ProductChain,
  PublicCodeGenerator,
} from '../application/ports/product-chain.port.js';
import { ProductChainNotConfiguredError } from '../domain/products.errors.js';

/** Ký giấy phép bằng REGISTRAR_SIGNER_PRIVATE_KEY và đọc ProductPassport qua RPC có dự phòng. */
@Injectable()
export class EthersProductChain implements ProductChain {
  readonly chainId: number;
  readonly contractAddress: string | null;
  private readonly signer: Wallet | null;

  constructor(
    private readonly chain: ChainProviderService,
    config: AppConfigService,
  ) {
    const productChain = config.productChain;
    this.chainId = config.chain.chainId;
    this.contractAddress = productChain?.productPassportAddress.toLowerCase() ?? null;
    this.signer = productChain ? new Wallet(productChain.registrarPrivateKey) : null;
  }

  signRegistration(registration: ProductRegistration): Promise<string> {
    if (!this.signer || !this.contractAddress) {
      throw new ProductChainNotConfiguredError();
    }
    return this.signer.signTypedData(
      productPassportDomain(this.chainId, this.contractAddress),
      PRODUCT_REGISTRATION_TYPES,
      registration,
    );
  }

  signSale(sale: ProductSale): Promise<string> {
    if (!this.signer || !this.contractAddress) {
      throw new ProductChainNotConfiguredError();
    }
    return this.signer.signTypedData(
      productPassportDomain(this.chainId, this.contractAddress),
      PRODUCT_SALE_TYPES,
      sale,
    );
  }

  async readProduct(chainProductId: string): Promise<OnchainProduct | null> {
    const address = this.contractAddress;
    if (!address) {
      throw new ProductChainNotConfiguredError();
    }
    const { result } = await this.chain.withFailover(async (provider) => {
      const passport = new Contract(address, PRODUCT_PASSPORT_ABI, provider);
      const value: unknown = await passport.getFunction('product').staticCall(chainProductId);
      return value;
    });
    return parseProduct(result);
  }
}

function isBytes32(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
}

/**
 * `product()` trả về struct (issuerId, metadataHash, custodianId, pendingCustodianId, ownerId,
 * state, warrantyMonths); state 0 (NONE) là chưa đăng ký.
 */
function parseProduct(value: unknown): OnchainProduct | null {
  if (!Array.isArray(value)) {
    throw new Error('ProductPassport.product() trả về giá trị không hợp lệ');
  }
  const [
    issuerId,
    metadataHash,
    custodianId,
    pendingCustodianId,
    ownerId,
    state,
    months,
  ]: unknown[] = value;
  if (
    !isBytes32(issuerId) ||
    !isBytes32(metadataHash) ||
    !isBytes32(custodianId) ||
    !isBytes32(pendingCustodianId) ||
    !isBytes32(ownerId) ||
    typeof state !== 'bigint' ||
    typeof months !== 'bigint'
  ) {
    throw new Error('ProductPassport.product() trả về giá trị không hợp lệ');
  }
  return state === 0n
    ? null
    : {
        issuerId: issuerId.toLowerCase(),
        metadataHash: metadataHash.toLowerCase(),
        custodianId: custodianId.toLowerCase(),
        pendingCustodianId: pendingCustodianId.toLowerCase(),
        ownerId: ownerId.toLowerCase(),
        state: Number(state),
        warrantyMonths: Number(months),
      };
}

/** Mã 12 ký tự lấy ngẫu nhiên đều từ bảng chữ 32 ký tự (60 bit), bằng bộ sinh số an toàn của Node. */
@Injectable()
export class CryptoPublicCodeGenerator implements PublicCodeGenerator {
  next(): string {
    return Array.from(
      { length: PUBLIC_CODE_LENGTH },
      () => PUBLIC_CODE_ALPHABET[randomInt(PUBLIC_CODE_ALPHABET.length)],
    ).join('');
  }
}
