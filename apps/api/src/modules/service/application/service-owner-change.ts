import { Inject, Injectable } from '@nestjs/common';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import {
  SERVICE_REQUEST_REPOSITORY,
  type ServiceRequestRepository,
} from './ports/service-request.repository.js';

/**
 * Public API của service cho module khác (M9).
 * - `onOwnerChanged`: Worker gọi khi sản phẩm đổi chủ; yêu cầu bảo hành chưa tiếp nhận của chủ cũ
 *   bị huỷ (chủ mới gửi yêu cầu của mình).
 * - `isUnderRepair`: sản phẩm đang có phiếu sửa mở thì không chuyển nhượng được.
 * - `onProductClosed` (M10): sản phẩm thu hồi, báo mất, ngừng sử dụng thì yêu cầu chưa tiếp nhận bị
 *   huỷ; phiếu đang mở vẫn để trung tâm đóng.
 */
@Injectable()
export class ServiceOwnerChange {
  constructor(
    @Inject(SERVICE_REQUEST_REPOSITORY) private readonly requests: ServiceRequestRepository,
  ) {}

  onOwnerChanged(
    productId: string,
    previousOwnerPartyId: string,
    at: Date,
    scope: TransactionScope,
  ): Promise<number> {
    return this.requests.cancelRequestedBy(productId, previousOwnerPartyId, at, scope);
  }

  onProductClosed(productId: string, at: Date, scope: TransactionScope): Promise<number> {
    return this.requests.cancelAllRequested(productId, at, scope);
  }

  async isUnderRepair(productId: string): Promise<boolean> {
    const requests = await this.requests.listForProduct(productId);
    return requests.some((request) => request.serviceState === 'IN_REPAIR');
  }
}
