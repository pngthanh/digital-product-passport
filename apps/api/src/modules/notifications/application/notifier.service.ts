import { Inject, Injectable } from '@nestjs/common';
import type { NotificationProduct, NotificationType } from '@dpp/shared';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import {
  NOTIFICATION_REPOSITORY,
  type NotificationRepository,
} from './ports/notification.repository.js';

export interface NotificationInput {
  type: NotificationType;
  /** UUID Party nhận; `null`, `undefined` và trùng lặp được bỏ qua. */
  recipients: readonly (string | null | undefined)[];
  product: NotificationProduct;
  organizationId?: string | null;
  reason?: string | null;
  result?: string | null;
  repaired?: boolean | null;
}

/**
 * Public API của notifications cho module khác (M10). Projector gọi trong cùng giao dịch CSDL đang
 * chiếu event, nên mỗi event chỉ tạo thông báo một lần; use case off-chain gọi không cần `scope`.
 */
@Injectable()
export class Notifier {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly notifications: NotificationRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  notify(input: NotificationInput, scope?: TransactionScope): Promise<number> {
    const recipients = [
      ...new Set(input.recipients.filter((id): id is string => typeof id === 'string')),
    ];
    if (recipients.length === 0) {
      return Promise.resolve(0);
    }
    const sentAt = this.clock.now();
    const payload = {
      product: {
        id: input.product.id,
        publicCode: input.product.publicCode,
        serialNumber: input.product.serialNumber,
        modelName: input.product.modelName,
      },
      organizationId: input.organizationId ?? null,
      reason: input.reason ?? null,
      result: input.result ?? null,
      repaired: input.repaired ?? null,
    };
    return this.notifications.insertMany(
      recipients.map((recipientPartyId) => ({
        recipientPartyId,
        type: input.type,
        payload,
        sentAt,
      })),
      scope,
    );
  }
}
