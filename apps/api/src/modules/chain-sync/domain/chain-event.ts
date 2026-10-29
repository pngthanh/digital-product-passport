/** Giá trị tham số event sau khi chuẩn hoá: số lớn thành chuỗi thập phân, địa chỉ/hash chữ thường. */
export type ChainEventArg = string | number | boolean;

/** Một event đã finalized, đủ metadata để ghi blockchain_events và chiếu sang bảng [P]. */
export interface ChainEvent {
  chainId: number;
  contractName: string;
  contractAddress: string;
  eventName: string;
  args: Readonly<Record<string, ChainEventArg>>;
  blockNumber: bigint;
  blockHash: string;
  blockTimestamp: Date;
  txHash: string;
  txIndex: number;
  logIndex: number;
  /** Ví gửi giao dịch phát ra event. */
  actorAddress: string | null;
  /** Khoá gom các event cùng đối tượng (partyId, requestId…). */
  correlationKey: string | null;
  /** productId (bytes32) khi event thuộc một sản phẩm. */
  chainProductId?: string | null;
  /** id dòng blockchain_events; có khi projector được gọi, để bảng [P] trỏ về đúng event. */
  eventId?: string;
}

/** Event đã FINALIZED đọc lại từ blockchain_events để hiển thị lịch sử. */
export interface RecordedChainEvent {
  eventName: string;
  txHash: string;
  blockNumber: bigint;
  logIndex: number;
  blockTimestamp: Date;
  actorAddress: string | null;
  args: Readonly<Record<string, ChainEventArg>>;
}
