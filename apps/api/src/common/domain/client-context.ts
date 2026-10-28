/** Nguồn của một thao tác (IP, trình duyệt), ghi kèm nhật ký kiểm toán. */
export interface ClientContext {
  ipAddress: string | null;
  userAgent: string | null;
}
