import { Inject, Injectable } from '@nestjs/common';
import {
  type ProductSale,
  type ProductSaleAuthorization,
  partyIdFromUuid,
  toChecksumAddress,
} from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import { AuditAction, AuditTrail } from '../../audit/index.js';
import { type AuthenticatedUser, IdentityDirectory } from '../../identity/index.js';
import { isDraft } from '../domain/product.js';
import {
  BuyerNotFoundError,
  ProductChainNotConfiguredError,
  ProductNotFoundError,
  ProductNotInStockError,
} from '../domain/products.errors.js';
import { RetailerAccess } from './organization-access.service.js';
import { PRODUCT_CHAIN, type ProductChain } from './ports/product-chain.port.js';
import { PRODUCT_REPOSITORY, type ProductRepository } from './ports/product.repository.js';
import { PRODUCT_AUTHORIZATION_TTL_SECONDS } from './product-authorizer.service.js';

/** a***@gmail.com: đủ để người bán đối chiếu với khách mà không lộ cả địa chỉ email. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

/**
 * DST-03 bước 1: nhà bán lẻ nhập email tài khoản của người mua. API kiểm tra hàng đang ở cửa hàng,
 * tìm tài khoản (người mua chưa cần liên kết ví) rồi ký giấy phép EIP-712 ProductSale gắn đúng
 * partyId người mua; ví nhà bán lẻ tự gửi sellAndActivateWarranty.
 */
@Injectable()
export class PrepareProductSale {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(PRODUCT_CHAIN) private readonly chain: ProductChain,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly access: RetailerAccess,
    private readonly identity: IdentityDirectory,
    private readonly audit: AuditTrail,
  ) {}

  async execute(
    user: AuthenticatedUser,
    productId: string,
    buyerEmail: string,
    client: ClientContext,
  ): Promise<ProductSaleAuthorization> {
    const contractAddress = this.chain.contractAddress;
    if (!contractAddress) {
      throw new ProductChainNotConfiguredError();
    }
    const { organization, wallet } = await this.access.require(user);
    const product = await this.products.findForRetailer(organization.id, productId);
    if (!product) {
      throw new ProductNotFoundError();
    }
    if (
      isDraft(product) ||
      product.productState !== 'AT_RETAIL' ||
      product.currentCustodianPartyId !== organization.id
    ) {
      throw new ProductNotInStockError();
    }
    const buyer = await this.identity.findPersonByEmail(buyerEmail);
    if (!buyer) {
      throw new BuyerNotFoundError();
    }

    const sale: ProductSale = {
      productId: product.chainProductId,
      retailerId: organization.partyId,
      buyerId: partyIdFromUuid(buyer.partyId),
      deadline: BigInt(
        Math.floor(this.clock.now().getTime() / 1000) + PRODUCT_AUTHORIZATION_TTL_SECONDS,
      ),
    };
    const signature = await this.chain.signSale(sale);
    await this.audit.record({
      action: AuditAction.PRODUCT_SALE_AUTHORIZED,
      actorUserId: user.id,
      targetType: 'product',
      targetId: product.id,
      metadata: { buyerUserId: buyer.userId, retailerId: organization.id },
      client,
    });
    return {
      method: 'sellAndActivateWarranty',
      chainId: this.chain.chainId,
      contractAddress: toChecksumAddress(contractAddress),
      wallet: toChecksumAddress(wallet),
      productId: sale.productId,
      retailerId: sale.retailerId,
      buyerId: sale.buyerId,
      deadline: sale.deadline.toString(),
      signature,
      buyer: { fullName: buyer.fullName, maskedEmail: maskEmail(buyer.email) },
      warrantyMonths: product.warrantyMonths,
    };
  }
}
