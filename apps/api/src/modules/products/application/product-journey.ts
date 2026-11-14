import {
  decodeChainEnum,
  type InspectionResult,
  type JourneyStep,
  type JourneyStepKind,
} from '@dpp/shared';
import type { RecordedChainEvent } from '../../chain-sync/index.js';
import { type PartyLabelMap, partyUuidOf } from './party-labels.js';

const PARTY_ARGS = [
  'issuerId',
  'fromPartyId',
  'toPartyId',
  'activatedBy',
  'serviceCenterId',
  'inspectorId',
  'ownerId',
] as const;

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

/** Kết quả đóng phiếu (enum ServiceTicketState on-chain) thành bước trên hành trình. */
function closedStep(state: string | number | boolean | undefined): JourneyStepKind | null {
  if (typeof state !== 'number') {
    return null;
  }
  try {
    const decoded = decodeChainEnum('ServiceTicketState', state);
    return decoded === 'REPAIRED'
      ? 'SERVICE_REPAIRED'
      : decoded === 'REJECTED'
        ? 'SERVICE_REJECTED'
        : null;
  } catch {
    return null;
  }
}

/** Kết quả kiểm định (enum InspectionResult on-chain); NONE hay giá trị lạ trả `null`. */
function inspectionResultOf(value: string | number | boolean | undefined): InspectionResult | null {
  if (typeof value !== 'number') {
    return null;
  }
  try {
    return decodeChainEnum('InspectionResult', value);
  } catch {
    return null;
  }
}

/**
 * Hành trình của sản phẩm từ event FINALIZED (cũ nhất trước): phát hành, gửi, huỷ/từ chối, nhận,
 * bán, chuyển nhượng, kích hoạt bảo hành, mở và đóng phiếu sửa chữa (M7), kiểm định (M8), thu hồi,
 * báo mất, ngừng sử dụng (M10). CustodyTransferred cùng
 * giao dịch với OwnershipTransferred thuộc về bước bán (hoặc chuyển nhượng) nên không tách thành
 * bước riêng; tạm dừng, tiếp tục bảo hành nằm trong bước mở, đóng phiếu.
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
    } else if (event.eventName === 'ServiceTicketOpened') {
      steps.push({
        ...base,
        kind: 'SERVICE_OPENED',
        from: labels.chainParty(event.args.serviceCenterId),
        to: null,
        warrantyCovered: event.args.warrantyCovered === true,
      });
    } else if (event.eventName === 'ServiceTicketClosed') {
      const kind = closedStep(event.args.state);
      // Trung tâm đóng phiếu chính là trung tâm đã mở phiếu cùng ticketId.
      const opened = events.find(
        (candidate) =>
          candidate.eventName === 'ServiceTicketOpened' &&
          candidate.args.ticketId === event.args.ticketId,
      );
      if (kind) {
        steps.push({
          ...base,
          kind,
          from: labels.chainParty(opened?.args.serviceCenterId),
          to: null,
        });
      }
    } else if (event.eventName === 'ProductRecalled') {
      steps.push({
        ...base,
        kind: 'RECALLED',
        from: labels.chainParty(event.args.issuerId),
        to: null,
      });
    } else if (
      event.eventName === 'ProductReportedLostStolen' ||
      event.eventName === 'ProductRetired'
    ) {
      steps.push({
        ...base,
        kind: event.eventName === 'ProductRetired' ? 'RETIRED' : 'REPORTED_LOST_STOLEN',
        from: labels.chainParty(event.args.ownerId),
        to: null,
      });
    } else if (event.eventName === 'InspectionRecorded') {
      const result = inspectionResultOf(event.args.result);
      if (result) {
        steps.push({
          ...base,
          kind: 'INSPECTED',
          from: labels.chainParty(event.args.inspectorId),
          to: null,
          inspectionResult: result,
        });
      }
    }
  }
  return steps;
}
