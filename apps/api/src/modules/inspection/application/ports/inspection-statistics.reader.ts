/** (M12) Số yêu cầu kiểm định theo kết cục, cho dashboard Admin (AUD-02). */
export interface InspectionSummary {
  pending: number;
  completed: number;
  declined: number;
}

/** Yêu cầu kiểm định chờ quá lâu (luật REQUEST_STALE). */
export interface WaitingInspectionRequest {
  requestId: string;
  productId: string;
  inspectorOrgId: string;
  since: Date;
}

export interface InspectionStatistics {
  summary(): Promise<InspectionSummary>;
  requestsWaitingSince(before: Date): Promise<WaitingInspectionRequest[]>;
}

export const INSPECTION_STATISTICS = Symbol('INSPECTION_STATISTICS');
