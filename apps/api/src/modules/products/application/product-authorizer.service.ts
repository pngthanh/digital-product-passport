import { Inject, Injectable } from '@nestjs/common';
import {
  type ProductRegistration,
  type ProductRegistrationAuthorization,
  toChecksumAddress,
} from '@dpp/shared';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import type { ProductRecord } from '../domain/product.js';
import { ProductChainNotConfiguredError } from '../domain/products.errors.js';
import type { OrganizationActor } from './organization-access.service.js';
import { PRODUCT_CHAIN, type ProductChain } from './ports/product-chain.port.js';

/** Giấy phép đăng ký có hiệu lực 15 phút: đủ để kiểm tra số dư và xác nhận trong MetaMask. */
export const PRODUCT_AUTHORIZATION_TTL_SECONDS = 15 * 60;

/** Ký giấy phép EIP-712 ProductRegistration cho các bản nháp, theo đúng thứ tự truyền vào. */
@Injectable()
export class ProductAuthorizer {
  constructor(
    @Inject(PRODUCT_CHAIN) private readonly chain: ProductChain,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async authorize(
    actor: OrganizationActor,
    drafts: readonly ProductRecord[],
  ): Promise<ProductRegistrationAuthorization> {
    const contractAddress = this.chain.contractAddress;
    if (!contractAddress) {
      throw new ProductChainNotConfiguredError();
    }
    const nowSeconds = Math.floor(this.clock.now().getTime() / 1000);
    const registration: ProductRegistration = {
      issuerId: actor.organization.partyId,
      productIds: drafts.map((draft) => draft.chainProductId),
      metadataHashes: drafts.map((draft) => draft.metadataHash),
      warrantyMonths: drafts.map((draft) => draft.warrantyMonths),
      deadline: BigInt(nowSeconds + PRODUCT_AUTHORIZATION_TTL_SECONDS),
    };
    const signature = await this.chain.signRegistration(registration);
    return {
      method: 'registerProducts',
      chainId: this.chain.chainId,
      contractAddress: toChecksumAddress(contractAddress),
      wallet: toChecksumAddress(actor.wallet),
      issuerId: registration.issuerId,
      productIds: registration.productIds,
      metadataHashes: registration.metadataHashes,
      warrantyMonths: registration.warrantyMonths,
      deadline: registration.deadline.toString(),
      signature,
      products: drafts.map((draft) => ({
        id: draft.id,
        serialNumber: draft.serialNumber,
        publicCode: draft.publicCode,
      })),
    };
  }
}
