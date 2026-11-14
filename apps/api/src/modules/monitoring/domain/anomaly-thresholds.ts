const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * (M12, AUD-03) Ngưỡng của các luật chạy nền, theo lựa chọn của nhóm. Đặt ở một chỗ để báo cáo và
 * màn hình Admin dẫn đúng con số.
 */
export const ANOMALY_THRESHOLDS = {
  /** Giao dịch web đã báo mà quá bấy nhiêu phút chưa chốt. */
  stuckTransactionMinutes: 15,
  /** Một ví bị revert ít nhất `revertMinCount` lần trong `revertWindowMinutes`. */
  revertWindowMinutes: 60,
  revertMinCount: 5,
  /** Block Indexer đã chiếu cũ hơn block finalized của chain quá bấy nhiêu phút. */
  indexerStaleMinutes: 10,
  /** Một email bị đăng nhập sai ít nhất `signInMinFailures` lần trong `signInWindowMinutes`. */
  signInWindowMinutes: 15,
  signInMinFailures: 10,
  /** Một sản phẩm đổi chủ ít nhất `ownershipMinChanges` lần trong `ownershipWindowDays` ngày. */
  ownershipWindowDays: 7,
  ownershipMinChanges: 3,
  /** Phiếu sửa mở quá bấy nhiêu ngày. */
  ticketOverdueDays: 30,
  /** Yêu cầu bảo hành, kiểm định chờ quá bấy nhiêu ngày. */
  requestStaleDays: 14,
} as const;

/** Mốc thời gian của từng luật tính từ `now`. */
export function detectionWindows(now: Date) {
  const at = now.getTime();
  const t = ANOMALY_THRESHOLDS;
  return {
    stuckBefore: new Date(at - t.stuckTransactionMinutes * MINUTE_MS),
    revertSince: new Date(at - t.revertWindowMinutes * MINUTE_MS),
    signInSince: new Date(at - t.signInWindowMinutes * MINUTE_MS),
    ownershipSince: new Date(at - t.ownershipWindowDays * DAY_MS),
    ticketOpenedBefore: new Date(at - t.ticketOverdueDays * DAY_MS),
    requestBefore: new Date(at - t.requestStaleDays * DAY_MS),
  };
}

/** Số ngày (làm tròn xuống) hoặc phút giữa hai mốc, để ghi vào chi tiết cảnh báo. */
export function wholeDaysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

export function wholeMinutesBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MINUTE_MS);
}

/**
 * Indexer chậm khi block mới nhất đã chiếu (mốc thấp nhất trong các contract) cũ hơn block
 * finalized của chain quá `indexerStaleMinutes`, tính theo thời gian của chính hai block đó.
 */
export function indexerLagMinutes(indexedBlockTime: Date, finalizedBlockTime: Date): number {
  return wholeMinutesBetween(indexedBlockTime, finalizedBlockTime);
}

export function indexerIsLagging(indexedBlockTime: Date, finalizedBlockTime: Date): boolean {
  return (
    indexerLagMinutes(indexedBlockTime, finalizedBlockTime) >=
    ANOMALY_THRESHOLDS.indexerStaleMinutes
  );
}
