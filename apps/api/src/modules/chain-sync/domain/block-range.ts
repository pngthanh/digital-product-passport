/** Đoạn block liên tục, tính cả hai đầu. */
export interface BlockRange {
  readonly from: bigint;
  readonly to: bigint;
}

/** Đoạn kế tiếp sau `lastScanned`, dài tối đa `maxBlocks` và không vượt `target`; `null` khi đã bắt kịp. */
export function nextBlockRange(
  lastScanned: bigint,
  target: bigint,
  maxBlocks: number,
): BlockRange | null {
  if (target <= lastScanned) {
    return null;
  }
  const from = lastScanned + 1n;
  const limit = from + BigInt(Math.max(1, maxBlocks)) - 1n;
  return { from, to: limit < target ? limit : target };
}

export function blockCount(range: BlockRange): number {
  return Number(range.to - range.from + 1n);
}
