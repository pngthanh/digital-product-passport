/** (M12) Số yêu cầu bảo hành, phiếu sửa chữa cho dashboard Admin (AUD-02). */
export interface ServiceSummary {
  /** Yêu cầu chờ trung tâm tiếp nhận. */
  pending: number;
  /** Phiếu đang mở (đang sửa). */
  inRepair: number;
  repaired: number;
  notRepaired: number;
}

/** Yêu cầu hoặc phiếu quá hạn (luật SERVICE_TICKET_OVERDUE, REQUEST_STALE). */
export interface OverdueServiceItem {
  requestId: string;
  productId: string;
  serviceCenterOrgId: string;
  /** Lúc mở phiếu (phiếu treo) hoặc lúc gửi yêu cầu (yêu cầu chờ). */
  since: Date;
}

export interface ServiceStatistics {
  summary(): Promise<ServiceSummary>;
  ticketsOpenedBefore(before: Date): Promise<OverdueServiceItem[]>;
  requestsWaitingSince(before: Date): Promise<OverdueServiceItem[]>;
}

export const SERVICE_STATISTICS = Symbol('SERVICE_STATISTICS');
