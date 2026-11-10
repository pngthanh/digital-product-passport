import { Inject, Injectable } from '@nestjs/common';
import type { ProductState, WarrantyState } from '@dpp/shared';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import { isDraft, type ProductRecord } from '../domain/product.js';
import { effectiveWarrantyState } from '../domain/warranty.js';
import { PRODUCT_REPOSITORY, type ProductRepository } from './ports/product.repository.js';

/** Thông tin sản phẩm module khác được đọc (đã ghi lên blockchain, không phải bản nháp). */
export interface ProductRef {
  id: string;
  chainProductId: string;
  publicCode: string;
  serialNumber: string;
  modelName: string;
  issuerOrgId: string;
  productState: ProductState;
  /** UUID Party của chủ sở hữu; `null` khi chưa bán. */
  currentOwnerPartyId: string | null;
  warrantyMonths: number;
}

/** Bảo hành tại thời điểm hỏi: trạng thái đã tính hết hạn theo giờ hiện tại (D10). */
export interface WarrantyRef {
  state: WarrantyState;
  expiresAt: Date;
}

function toRef(product: ProductRecord): ProductRef | null {
  if (isDraft(product) || product.productState === null) {
    return null;
  }
  return {
    id: product.id,
    chainProductId: product.chainProductId,
    publicCode: product.publicCode,
    serialNumber: product.serialNumber,
    modelName: product.modelName,
    issuerOrgId: product.issuerOrgId,
    productState: product.productState,
    currentOwnerPartyId: product.currentOwnerPartyId,
    warrantyMonths: product.warrantyMonths,
  };
}

/** Public API của products cho module khác (bảo hành, sửa chữa ở M7, kiểm định ở M8). */
@Injectable()
export class ProductDirectory {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<ProductRef | null> {
    const product = await this.products.findById(id);
    return product && toRef(product);
  }

  /** (M9) Gắn lần đổi chủ vừa chiếu với yêu cầu chuyển nhượng; dùng trong Worker. */
  linkOwnershipTransfer(
    link: { productId: string; toPartyId: string; txHash: string; transferRequestId: string },
    scope: TransactionScope,
  ): Promise<boolean> {
    return this.products.linkOwnershipTransfer(link, scope);
  }

  /** Theo mã QR công khai (tra cứu không cần đăng nhập, M8 kiểm định). */
  async findByPublicCode(publicCode: string): Promise<ProductRef | null> {
    const product = await this.products.findByPublicCode(publicCode);
    return product && toRef(product);
  }

  /** `scope` để Worker đọc trong cùng giao dịch CSDL đang chiếu event. */
  async findByChainProductId(
    chainProductId: string,
    scope?: TransactionScope,
  ): Promise<ProductRef | null> {
    const product = await this.products.findByChainProductId(chainProductId.toLowerCase(), scope);
    return product && toRef(product);
  }

  async describe(ids: readonly string[]): Promise<Map<string, ProductRef>> {
    const products = await Promise.all([...new Set(ids)].map((id) => this.products.findById(id)));
    const refs = products.flatMap((product) => {
      const ref = product && toRef(product);
      return ref ? [ref] : [];
    });
    return new Map(refs.map((ref) => [ref.id, ref]));
  }

  /** Bảo hành theo productId; sản phẩm chưa kích hoạt bảo hành thì không có trong kết quả. */
  async warrantiesOf(productIds: readonly string[]): Promise<Map<string, WarrantyRef>> {
    const now = this.clock.now();
    const warranties = await this.products.findWarranties([...new Set(productIds)]);
    return new Map(
      [...warranties].map(([productId, warranty]) => [
        productId,
        { state: effectiveWarrantyState(warranty, now), expiresAt: warranty.expiresAt },
      ]),
    );
  }
}
