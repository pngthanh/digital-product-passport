import type { JourneyStep, JourneyStepKind } from '@dpp/shared';
import type { RecordedChainEvent } from '../../chain-sync/index.js';
import { type PartyLabelMap, partyUuidOf } from './party-labels.js';

const PARTY_ARGS = ['issuerId', 'fromPartyId', 'toPartyId', 'activatedBy'] as const;

const SIMPLE_STEPS: Readonly<Record<string, JourneyStepKind>> = {
  CustodyHandoverInitiated: 'DISPATCHED',
  CustodyHandoverCancelled: 'DISPATCH_CANCELLED',
  CustodyHandoverRejected: 'DISPATCH_REJECTED',
};

/** UUID của mọi Party xuất hiện trong các event, để tra tên một lần. */
export function partiesInEvents(events: readonly RecordedChainEvent[]): string[] {
  const ids = new Set<string>();
  for (const event of events) {
    for (const name of PARTY_ARGS) {
      const value = event.args[name];
      const uuid = typeof value === 'string' ? partyUuidOf(value) : null;
      if (uuid) {
        ids.add(uuid);
      }
    }
  }
  return [...ids];
}

/**
 * Hành trình của sản phẩm từ event FINALIZED (cũ nhất trước): phát hành, gửi, huỷ/từ chối, nhận,
 * bán, chuyển nhượng, kích hoạt bảo hành. CustodyTransferred cùng giao dịch với OwnershipTransferred
 * thuộc về bước bán (hoặc chuyển nhượng) nên không tách thành bước riêng.
 */
export function buildJourney(
  events: readonly RecordedChainEvent[],
  labels: PartyLabelMap,
): JourneyStep[] {
  const ownershipTxs = new Set(
    events
      .filter((event) => event.eventName === 'OwnershipTransferred')
      .map((event) => event.txHash),
  );
  const steps: JourneyStep[] = [];
  for (const event of events) {
    const base = { at: event.blockTimestamp.toISOString(), txHash: event.txHash };
    const from = labels.chainParty(event.args.fromPartyId);
    const to = labels.chainParty(event.args.toPartyId);
    const simple = SIMPLE_STEPS[event.eventName];
    if (simple) {
      steps.push({ ...base, kind: simple, from, to });
    } else if (event.eventName === 'ProductRegistered') {
      steps.push({
        ...base,
        kind: 'REGISTERED',
        from: null,
        to: labels.chainParty(event.args.issuerId),
      });
    } else if (event.eventName === 'CustodyTransferred' && !ownershipTxs.has(event.txHash)) {
      steps.push({ ...base, kind: 'RECEIVED', from, to });
    } else if (event.eventName === 'OwnershipTransferred') {
      const firstSale = from === null;
      // Lần bán đầu: bên bán là nhà bán lẻ giao hàng trong cùng giao dịch.
      const seller = events.find(
        (candidate) =>
          candidate.txHash === event.txHash && candidate.eventName === 'CustodyTransferred',
      );
      steps.push({
        ...base,
        kind: firstSale ? 'SOLD' : 'OWNERSHIP_TRANSFERRED',
        from: firstSale ? labels.chainParty(seller?.args.fromPartyId) : from,
        to,
      });
    } else if (event.eventName === 'WarrantyActivated') {
      steps.push({
        ...base,
        kind: 'WARRANTY_ACTIVATED',
        from: labels.chainParty(event.args.activatedBy),
        to: null,
      });
    }
  }
  return steps;
}
