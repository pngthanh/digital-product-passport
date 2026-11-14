import { Inject, Injectable } from '@nestjs/common';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import {
  INSPECTION_REQUEST_REPOSITORY,
  type InspectionRequestRepository,
} from './ports/inspection-request.repository.js';

/**
 * Public API của inspection cho module khác. M9: Worker gọi khi sản phẩm đổi chủ; yêu cầu kiểm định
 * chưa có kết quả của chủ cũ bị huỷ, yêu cầu của nhà sản xuất giữ nguyên. M10: sản phẩm thu hồi, báo
 * mất, ngừng sử dụng thì mọi yêu cầu chưa có kết quả bị huỷ (InspectionRegistry không ghi được nữa).
 */
@Injectable()
export class InspectionOwnerChange {
  constructor(
    @Inject(INSPECTION_REQUEST_REPOSITORY) private readonly requests: InspectionRequestRepository,
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
}
