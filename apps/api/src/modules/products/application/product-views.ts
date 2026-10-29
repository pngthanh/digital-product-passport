import { Inject, Injectable } from '@nestjs/common';
import {
  type ChainEventView,
  type JourneyStep,
  productMetadataHash,
  type ProductProof,
  type ProductSummary,
  toChecksumAddress,
  type WarrantyView,
} from '@dpp/shared';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import { ChainEventHistory, presentChainEvent } from '../../chain-sync/index.js';
import { isDraft, metadataOf, type ProductRecord } from '../domain/product.js';
import { effectiveWarrantyState, type WarrantyRecord } from '../domain/warranty.js';
import { type PartyLabelMap, PartyLabels } from './party-labels.js';
import { PRODUCT_CHAIN, type ProductChain } from './ports/product-chain.port.js';
import { PRODUCT_REPOSITORY, type ProductRepository } from './ports/product.repository.js';
import { buildJourney, partiesInEvents } from './product-journey.js';

export function presentProduct(product: ProductRecord, labels: PartyLabelMap): ProductSummary {
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
    holder: isDraft(product) ? null : labels.party(product.currentCustodianPartyId),
    pendingRetailer: labels.organization(product.pendingCustodianPartyId),
  };
}

/** Party cần tên khi hiển thị danh sách: nhà sản xuất, bên giữ hàng, bên đang được giao tới. */
export function partiesOf(products: readonly ProductRecord[]): (string | null)[] {
  return products.flatMap((product) => [
    product.issuerOrgId,
    product.currentCustodianPartyId,
    product.pendingCustodianPartyId,
  ]);
}

/** Phần hiển thị dùng chung của trang chi tiết (nhà sản xuất, nhà bán lẻ, chủ sở hữu, công khai). */
export interface ProductTimeline {
  labels: PartyLabelMap;
  warranty: WarrantyView | null;
  journey: JourneyStep[];
  history: ChainEventView[];
}

/** Bằng chứng on-chain, bảo hành, hành trình và lịch sử event của sản phẩm. */
@Injectable()
export class ProductViews {
  constructor(
    @Inject(PRODUCT_CHAIN) private readonly chain: ProductChain,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly chainHistory: ChainEventHistory,
    private readonly partyLabels: PartyLabels,
  ) {}

  /** Nhãn cho danh sách sản phẩm; `viewerPartyId` để đánh dấu "bạn" khi người xem là chủ. */
  labels(
    products: readonly ProductRecord[],
    viewerPartyId: string | null = null,
    extraPartyIds: readonly string[] = [],
  ): Promise<PartyLabelMap> {
    return this.partyLabels.resolve([...partiesOf(products), ...extraPartyIds], viewerPartyId);
  }

  async warranties(products: readonly ProductRecord[]): Promise<Map<string, WarrantyRecord>> {
    return this.products.findWarranties(products.map((product) => product.id));
  }

  presentWarranty(
    product: ProductRecord,
    warranty: WarrantyRecord | undefined,
    labels: PartyLabelMap,
  ): WarrantyView | null {
    if (!warranty) {
      return null;
    }
    return {
      state: effectiveWarrantyState(warranty, this.clock.now()),
      months: product.warrantyMonths,
      activatedAt: warranty.activatedAt.toISOString(),
      expiresAt: warranty.expiresAt.toISOString(),
      activatedBy: labels.organization(warranty.activatedByPartyId),
      activationTxHash: warranty.activationTxHash,
    };
  }

  /** Bảo hành, hành trình và lịch sử event của một sản phẩm, tra tên các bên một lần. */
  async timeline(product: ProductRecord, viewerPartyId: string | null): Promise<ProductTimeline> {
    const [events, warranties] = await Promise.all([
      isDraft(product)
        ? Promise.resolve([])
        : this.chainHistory.ofProducts([product.chainProductId]),
      this.products.findWarranties([product.id]),
    ]);
    const warranty = warranties.get(product.id);
    const labels = await this.partyLabels.resolve(
      [...partiesOf([product]), ...partiesInEvents(events), warranty?.activatedByPartyId ?? null],
      viewerPartyId,
    );
    return {
      labels,
      warranty: this.presentWarranty(product, warranty, labels),
      journey: buildJourney(events, labels),
      history: events.map(presentChainEvent),
    };
  }

  /**
   * Băm lại hồ sơ đang hiển thị và đọc trực tiếp `ProductPassport.product()`: hai hash và nhà phát
   * hành phải khớp. `null` khi API chưa cấu hình ProductPassport.
   */
  async proof(product: ProductRecord, issuerPartyId: string): Promise<ProductProof | null> {
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
        onchain.issuerId === issuerPartyId;
    } catch {
      onchainMatches = null;
    }
    return {
      chainId: this.chain.chainId,
      contractAddress: toChecksumAddress(contractAddress),
      productId: product.chainProductId,
      metadataHash: product.metadataHash,
      metadataMatchesHash:
        productMetadataHash(metadataOf(product, issuerPartyId)) === product.metadataHash,
      onchainMatches,
      registrationTxHash: product.createdTxHash,
      registeredAt: product.onchainCreatedAt?.toISOString() ?? null,
    };
  }
}
