import type { InspectionRecord } from '@dpp/shared';

/** InspectionRegistry: ký giấy phép ghi kết quả bằng khoá registrar. */
export interface InspectionChain {
  readonly chainId: number;
  /** Chữ thường; `null` khi chưa cấu hình. */
  readonly contractAddress: string | null;
  signRecord(record: InspectionRecord): Promise<string>;
}

export const INSPECTION_CHAIN = Symbol('INSPECTION_CHAIN');
