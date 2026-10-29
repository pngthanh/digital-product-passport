/*
 * Dữ liệu on-chain trả cho Web để người dùng tự đối chiếu trên explorer.
 */

/** Một event đã FINALIZED trong blockchain_events. */
export interface ChainEventView {
  eventName: string;
  txHash: string;
  /** Số block, dạng chuỗi thập phân. */
  blockNumber: string;
  logIndex: number;
  blockTimestamp: string;
  /** Ví đã gửi giao dịch. */
  actorAddress: string | null;
  args: Record<string, string | number | boolean>;
}
