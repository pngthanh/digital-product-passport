import { partyIdFromUuid } from '@dpp/shared';
import type { RecordedChainEvent } from '../../chain-sync/index.js';
import type { OrganizationRef } from '../../organizations/index.js';
import { PartyLabelMap } from './party-labels.js';
import { buildJourney, partiesInEvents } from './product-journey.js';

const CENTER_ID = '019a0000-0000-7000-8000-00000000c001';
const CENTER: OrganizationRef = {
  id: CENTER_ID,
  name: 'Trung tâm Bảo hành Minh Phát',
  taxCode: '0311112222',
  orgType: 'SERVICE_CENTER',
  authStatus: 'AUTHORIZED',
  address: null,
  partyId: partyIdFromUuid(CENTER_ID),
};
const TICKET = `0x${'1a'.repeat(32)}`;
const PRODUCT = `0x${'2b'.repeat(32)}`;

function event(
  eventName: string,
  txHash: string,
  args: RecordedChainEvent['args'],
  logIndex = 0,
): RecordedChainEvent {
  return {
    eventName,
    txHash,
    blockNumber: 10n,
    logIndex,
    blockTimestamp: new Date('2026-11-01T03:00:00.000Z'),
    actorAddress: null,
    args,
  };
}

describe('Hành trình: bước sửa chữa (M7)', () => {
  const openTx = `0x${'a1'.repeat(32)}`;
  const closeTx = `0x${'b2'.repeat(32)}`;
  const events = [
    event('ServiceTicketOpened', openTx, {
      ticketId: TICKET,
      productId: PRODUCT,
      serviceCenterId: CENTER.partyId,
      requesterId: partyIdFromUuid('019a0000-0000-7000-8000-0000000000aa'),
      warrantyCovered: false,
    }),
    event('WarrantySuspended', openTx, { productId: PRODUCT }, 1),
    event('ServiceTicketClosed', closeTx, {
      ticketId: TICKET,
      productId: PRODUCT,
      state: 3,
      evidenceHash: `0x${'cc'.repeat(32)}`,
    }),
  ];

  it('mở phiếu ghi trung tâm và "ngoài bảo hành"; đóng phiếu lấy trung tâm từ bước mở', () => {
    const labels = new PartyLabelMap(new Map([[CENTER_ID, CENTER]]), null);
    const center = { kind: 'ORGANIZATION', organization: { name: CENTER.name } };

    expect(partiesInEvents(events)).toContain(CENTER_ID);
    expect(buildJourney(events, labels)).toMatchObject([
      { kind: 'SERVICE_OPENED', txHash: openTx, from: center, warrantyCovered: false },
      { kind: 'SERVICE_REJECTED', txHash: closeTx, from: center, to: null },
    ]);
  });

  it('đóng phiếu đã sửa thành SERVICE_REPAIRED; state lạ thì bỏ qua', () => {
    const labels = new PartyLabelMap(new Map(), null);
    const repaired = events.map((item) =>
      item.eventName === 'ServiceTicketClosed'
        ? { ...item, args: { ...item.args, state: 2 } }
        : item,
    );
    const unknown = events.map((item) =>
      item.eventName === 'ServiceTicketClosed'
        ? { ...item, args: { ...item.args, state: 9 } }
        : item,
    );

    expect(buildJourney(repaired, labels).map((step) => step.kind)).toEqual([
      'SERVICE_OPENED',
      'SERVICE_REPAIRED',
    ]);
    expect(buildJourney(unknown, labels).map((step) => step.kind)).toEqual(['SERVICE_OPENED']);
  });
});

describe('Hành trình: kiểm định (M8)', () => {
  const LAB_ID = '019a0000-0000-7000-8000-00000000d001';
  const LAB: OrganizationRef = {
    id: LAB_ID,
    name: 'Trung tâm Kiểm định Quatest',
    taxCode: '0312223333',
    orgType: 'INSPECTOR',
    authStatus: 'AUTHORIZED',
    address: null,
    partyId: partyIdFromUuid(LAB_ID),
  };
  const recordTx = `0x${'c3'.repeat(32)}`;
  const recorded = (result: number) =>
    event('InspectionRecorded', recordTx, {
      inspectionId: `0x${'3c'.repeat(32)}`,
      productId: PRODUCT,
      inspectorId: LAB.partyId,
      requesterId: partyIdFromUuid('019a0000-0000-7000-8000-0000000000aa'),
      result,
      reportHash: `0x${'dd'.repeat(32)}`,
    });

  it('ghi đơn vị kiểm định và kết quả; người gửi không hiện', () => {
    const labels = new PartyLabelMap(new Map([[LAB_ID, LAB]]), null);

    expect(partiesInEvents([recorded(2)])).toContain(LAB_ID);
    expect(buildJourney([recorded(2)], labels)).toEqual([
      {
        kind: 'INSPECTED',
        at: '2026-11-01T03:00:00.000Z',
        txHash: recordTx,
        from: {
          kind: 'ORGANIZATION',
          organization: { organizationId: LAB_ID, name: LAB.name, partyId: LAB.partyId },
        },
        to: null,
        inspectionResult: 'FAIL',
      },
    ]);
  });

  it('kết quả NONE hoặc lạ thì bỏ qua', () => {
    const labels = new PartyLabelMap(new Map(), null);
    expect(buildJourney([recorded(0), recorded(7)], labels)).toEqual([]);
  });
});
