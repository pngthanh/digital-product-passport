import type { NotificationProduct, NotificationType } from '@dpp/shared';

/**
 * Nội dung thông báo lưu ở cột payload (JSONB). Sản phẩm được chụp lại lúc tạo; tên tổ chức tra lúc
 * đọc theo `organizationId` để luôn là tên hiện tại.
 */
export interface NotificationPayload {
  product: NotificationProduct;
  organizationId: string | null;
  reason: string | null;
  result: string | null;
  repaired: boolean | null;
}

export interface NotificationRecord {
  id: string;
  recipientPartyId: string;
  type: NotificationType;
  payload: NotificationPayload;
  createdAt: Date;
  readAt: Date | null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Đọc payload từ JSON đã lưu; dữ liệu hỏng thì trả `null` để bỏ qua thay vì làm hỏng cả trang. */
export function parsePayload(value: unknown): NotificationPayload | null {
  if (!isRecord(value) || !isRecord(value.product)) {
    return null;
  }
  const product = value.product;
  const id = text(product.id);
  const publicCode = text(product.publicCode);
  const serialNumber = text(product.serialNumber);
  const modelName = text(product.modelName);
  if (!id || !publicCode || !serialNumber || !modelName) {
    return null;
  }
  return {
    product: { id, publicCode, serialNumber, modelName },
    organizationId: text(value.organizationId),
    reason: text(value.reason),
    result: text(value.result),
    repaired: typeof value.repaired === 'boolean' ? value.repaired : null,
  };
}
