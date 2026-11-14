/** (M12) Số yêu cầu chuyển nhượng theo trạng thái, cho dashboard Admin (AUD-02). */
export interface TransferSummary {
  pending: number;
  completed: number;
  rejected: number;
  cancelled: number;
  expired: number;
}

export interface TransferStatistics {
  summary(): Promise<TransferSummary>;
}

export const TRANSFER_STATISTICS = Symbol('TRANSFER_STATISTICS');
