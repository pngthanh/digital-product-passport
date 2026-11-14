import type { InspectionResult, NotificationView, OrgType } from '@dpp/shared';
import { INSPECTION_RESULT_LABELS } from '@/lib/state-labels';

export interface NotificationText {
  title: string;
  body: string;
  /** Trang xem chi tiết (đường dẫn trong web). */
  href: string;
}

function productText(notification: NotificationView): string {
  return `${notification.product.modelName} (${notification.product.serialNumber})`;
}

function resultLabel(result: string | null): string {
  return result && result in INSPECTION_RESULT_LABELS
    ? INSPECTION_RESULT_LABELS[result as InspectionResult].label
    : 'đã có kết quả';
}

/**
 * Nội dung và nơi dẫn tới của một thông báo. `orgType` là loại tổ chức người dùng đại diện: thông
 * báo gửi cho nhà sản xuất dẫn về trang sản phẩm của nhà sản xuất, còn lại về trang Đã mua.
 */
export function notificationText(
  notification: NotificationView,
  orgType: OrgType | null,
): NotificationText {
  const product = productText(notification);
  const organization = notification.organizationName ?? 'Doanh nghiệp';
  const { id, publicCode } = notification.product;
  const productPage =
    notification.forOrganization && orgType === 'MANUFACTURER' ? `/products/${id}` : `/owned/${id}`;
  switch (notification.type) {
    case 'PRODUCT_RECALLED':
      return {
        title: 'Sản phẩm bị thu hồi',
        body: `${organization} thu hồi ${product}.${notification.reason ? ` Lý do: ${notification.reason}` : ''}`,
        href: `/p/${publicCode}`,
      };
    case 'CUSTODY_DISPATCHED':
      return {
        title: 'Có hàng gửi tới cửa hàng',
        body: `${organization} gửi ${product}. Vào Kho hàng để xác nhận đã nhận.`,
        href: '/inventory?filter=INCOMING',
      };
    case 'SERVICE_TICKET_OPENED':
      return {
        title: 'Trung tâm bảo hành đã tiếp nhận',
        body: `${organization} đã mở phiếu sửa chữa cho ${product}.`,
        href: productPage,
      };
    case 'SERVICE_TICKET_CLOSED':
      return {
        title: notification.repaired ? 'Sản phẩm đã sửa xong' : 'Sản phẩm không sửa được',
        body: `${organization} đã đóng phiếu sửa chữa ${product}: ${notification.repaired ? 'đã sửa xong' : 'không sửa được'}.`,
        href: productPage,
      };
    case 'INSPECTION_RECORDED':
      return {
        title: 'Có kết quả kiểm định',
        body: `${organization}: ${resultLabel(notification.result)} cho ${product}.`,
        href: productPage,
      };
    case 'INSPECTION_DECLINED':
      return {
        title: 'Yêu cầu kiểm định bị từ chối',
        body: `${organization} từ chối kiểm định ${product}.${notification.reason ? ` Lý do: ${notification.reason}` : ''}`,
        href: productPage,
      };
    case 'TRANSFER_REQUESTED':
      return {
        title: 'Có yêu cầu chuyển nhượng gửi tới',
        body: `Một yêu cầu chuyển nhượng ${product} đang chờ bạn chấp nhận hoặc từ chối.`,
        href: '/transfers?filter=INCOMING',
      };
    case 'TRANSFER_ACCEPTED':
      return {
        title: 'Bên nhận đã chấp nhận chuyển nhượng',
        body: `Quyền sở hữu ${product} đã chuyển sang bên nhận.`,
        href: '/transfers?filter=CLOSED',
      };
    case 'TRANSFER_REJECTED':
      return {
        title: 'Bên nhận đã từ chối chuyển nhượng',
        body: `Yêu cầu chuyển nhượng ${product} bị từ chối; sản phẩm vẫn thuộc bạn.`,
        href: '/transfers?filter=CLOSED',
      };
    default:
      return { title: 'Thông báo', body: product, href: `/p/${publicCode}` };
  }
}
