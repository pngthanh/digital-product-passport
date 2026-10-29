import { Inject, Injectable } from '@nestjs/common';
import {
  type ChainEventView,
  productMetadataHash,
  type ProductProof,
  type ProductSummary,
  toChecksumAddress,
} from '@dpp/shared';
import { ChainEventHistory, presentChainEvent } from '../../chain-sync/index.js';
import type { OrganizationRef } from '../../organizations/index.js';
import { isDraft, metadataOf, type ProductRecord } from '../domain/product.js';
import { PRODUCT_CHAIN, type ProductChain } from './ports/product-chain.port.js';

export function presentProduct(product: ProductRecord): ProductSummary {
  return {
    id: product.id,
    publicCode: product.publicCode,
    serialNumber: product.serialNumber,
    modelName: product.modelName,
    manufacturedOn: product.manufacturedOn,
    warrantyMonths: product.warrantyMonths,
    productState: product.productState,
    syncStatus: product.syncStatus,
    chainProductId: product.chainProductId,
    metadataHash: product.metadataHash,
    createdTxHash: product.createdTxHash,
    onchainCreatedAt: product.onchainCreatedAt?.toISOString() ?? null,
    createdAt: product.createdAt.toISOString(),
  };
}

/** Bằng chứng on-chain và lịch sử event của sản phẩm, để người xem tự đối chiếu. */
@Injectable()
export class ProductViews {
  constructor(
    @Inject(PRODUCT_CHAIN) private readonly chain: ProductChain,
    private readonly chainHistory: ChainEventHistory,
  ) {}

  /**
   * Băm lại hồ sơ đang hiển thị và đọc trực tiếp `ProductPassport.product()`: hai hash và nhà phát
   * hành phải khớp. `null` khi API chưa cấu hình ProductPassport.
   */
  async proof(product: ProductRecord, issuer: OrganizationRef): Promise<ProductProof | null> {
    const contractAddress = this.chain.contractAddress;
    if (!contractAddress) {
      return null;
    }
    let onchainMatches: boolean | null = null;
    try {
      const onchain = await this.chain.readProduct(product.chainProductId);
      onchainMatches =
        onchain !== null &&
        onchain.metadataHash === product.metadataHash &&
        onchain.issuerId === issuer.partyId;
    } catch {
      onchainMatches = null;
    }
    return {
      chainId: this.chain.chainId,
      contractAddress: toChecksumAddress(contractAddress),
      productId: product.chainProductId,
      metadataHash: product.metadataHash,
      metadataMatchesHash:
        productMetadataHash(metadataOf(product, issuer.partyId)) === product.metadataHash,
      onchainMatches,
      registrationTxHash: product.createdTxHash,
      registeredAt: product.onchainCreatedAt?.toISOString() ?? null,
    };
  }

  async history(product: ProductRecord): Promise<ChainEventView[]> {
    if (isDraft(product)) {
      return [];
    }
    const events = await this.chainHistory.ofProducts([product.chainProductId]);
    return events.map(presentChainEvent);
  }
}
