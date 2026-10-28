import { decideConfirmation, TX_DROP_TIMEOUT_MS } from './transaction-confirmation.js';

const submittedAt = new Date('2026-10-28T08:00:00Z');
const soon = new Date(submittedAt.getTime() + 5_000);

describe('decideConfirmation', () => {
  it('chờ khi chưa có receipt và chưa quá hạn', () => {
    expect(
      decideConfirmation({ receipt: null, finalizedBlock: 10n, submittedAt, now: soon }),
    ).toEqual({ kind: 'wait' });
  });

  it('đánh dấu bỏ khi quá hạn mà vẫn không có receipt', () => {
    const late = new Date(submittedAt.getTime() + TX_DROP_TIMEOUT_MS + 1);
    expect(
      decideConfirmation({ receipt: null, finalizedBlock: 10n, submittedAt, now: late }),
    ).toEqual({ kind: 'drop' });
  });

  it('chờ khi block chứa giao dịch chưa finalized', () => {
    expect(
      decideConfirmation({
        receipt: { succeeded: true, blockNumber: 12n },
        finalizedBlock: 10n,
        submittedAt,
        now: soon,
      }),
    ).toEqual({ kind: 'wait' });
  });

  it('chốt CONFIRMED hoặc REVERTED khi đã finalized', () => {
    const base = { finalizedBlock: 12n, submittedAt, now: soon };
    expect(decideConfirmation({ ...base, receipt: { succeeded: true, blockNumber: 12n } })).toEqual(
      { kind: 'finalize', status: 'CONFIRMED' },
    );
    expect(
      decideConfirmation({ ...base, receipt: { succeeded: false, blockNumber: 11n } }),
    ).toEqual({ kind: 'finalize', status: 'REVERTED' });
  });

  it('chờ khi RPC không trả block finalized', () => {
    expect(
      decideConfirmation({
        receipt: { succeeded: true, blockNumber: 1n },
        finalizedBlock: null,
        submittedAt,
        now: soon,
      }),
    ).toEqual({ kind: 'wait' });
  });
});
