/*
 * Thông báo trong ứng dụng (M10), dùng chung cho API và Web. Thông báo gửi tới một Party: cá nhân,
 * hoặc tổ chức (người đại diện đọc).
 */

export const NOTIFICATION_TYPES = [
  // M10: nhà sản xuất thu hồi; báo chủ sở hữu và nhà bán lẻ đang giữ hoặc sắp nhận hàng.
  'PRODUCT_RECALLED',
  // M6: nhà sản xuất gửi hàng tới nhà bán lẻ.
  'CUSTODY_DISPATCHED',
  // M7: trung tâm tiếp nhận (mở phiếu), đóng phiếu (sửa xong hoặc không sửa được).
  'SERVICE_TICKET_OPENED',
  'SERVICE_TICKET_CLOSED',
  // M8: đơn vị kiểm định ghi kết quả hoặc từ chối yêu cầu.
  'INSPECTION_RECORDED',
  'INSPECTION_DECLINED',
  // M9: có yêu cầu chuyển nhượng gửi tới; bên nhận chấp nhận hoặc từ chối.
  'TRANSFER_REQUESTED',
  'TRANSFER_ACCEPTED',
  'TRANSFER_REJECTED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Sản phẩm trong thông báo, chụp lại lúc tạo thông báo. */
export interface NotificationProduct {
  id: string;
  publicCode: string;
  serialNumber: string;
  modelName: string;
}

export interface NotificationView {
  id: string;
  type: NotificationType;
  createdAt: string;
  /** `null` khi chưa đọc. */
  readAt: string | null;
  product: NotificationProduct;
  /** Tổ chức liên quan: nhà sản xuất, trung tâm bảo hành, đơn vị kiểm định. */
  organizationName: string | null;
  /** Lý do thu hồi hoặc lý do từ chối kiểm định. */
  reason: string | null;
  /** Kết quả kiểm định (PASS, FAIL, CONDITIONAL). */
  result: string | null;
  /** Phiếu sửa chữa: sửa xong (`true`) hay không sửa được (`false`). */
  repaired: boolean | null;
  /** Gửi cho tổ chức người dùng đại diện (không phải cá nhân), để web dẫn tới đúng trang. */
  forOrganization: boolean;
}

/** `GET /me/notifications`. */
export interface MyNotifications {
  items: NotificationView[];
  total: number;
  unread: number;
  page: number;
  pageSize: number;
}

/** `GET /me/notifications/summary`: số chưa đọc cho chuông trên menu. */
export interface NotificationSummary {
  unread: number;
}

/** `POST /me/notifications/read`: không có `ids` là đánh dấu tất cả. */
export interface MarkNotificationsReadInput {
  ids?: string[];
}
