import { blockCount, nextBlockRange } from './block-range.js';
import { advanceFinalized, advanceObserved, initialCheckpoint } from './indexer-checkpoint.js';

const HASH = `0x${'aa'.repeat(32)}`;
const NEXT_HASH = `0x${'bb'.repeat(32)}`;

describe('nextBlockRange', () => {
  it('lấy đoạn kế tiếp, không vượt đích', () => {
    expect(nextBlockRange(10n, 500n, 100)).toEqual({ from: 11n, to: 110n });
    expect(nextBlockRange(450n, 500n, 100)).toEqual({ from: 451n, to: 500n });
    expect(blockCount({ from: 451n, to: 500n })).toBe(50);
  });

  it('đã bắt kịp thì không còn đoạn nào', () => {
    expect(nextBlockRange(500n, 500n, 100)).toBeNull();
    expect(nextBlockRange(510n, 500n, 100)).toBeNull();
  });
});

describe('IndexerCheckpoint', () => {
  const start = initialCheckpoint(10143, '0xabc', { number: 99n, hash: HASH });

  it('mốc đầu đứng trước block bắt đầu', () => {
    expect(start).toEqual({
      chainId: 10143,
      contractAddress: '0xabc',
      lastObservedBlock: 99n,
      lastFinalizedBlock: 99n,
      lastFinalizedBlockHash: HASH,
    });
  });

  it('phần đã quan sát không bao giờ thấp hơn phần đã chốt', () => {
    const observed = advanceObserved(start, 120n);
    expect(advanceFinalized(observed, { number: 110n, hash: NEXT_HASH })).toMatchObject({
      lastFinalizedBlock: 110n,
      lastFinalizedBlockHash: NEXT_HASH,
      lastObservedBlock: 120n,
    });
    expect(advanceFinalized(start, { number: 130n, hash: NEXT_HASH }).lastObservedBlock).toBe(130n);
    expect(advanceObserved(observed, 100n)).toBe(observed);
  });
});
