import { partyIdFromUuid } from '@dpp/shared';
import {
  inspectionIdOf,
  requesterRoleOf,
  requesterStillAllowed,
  requestIdOf,
} from './inspection-request.js';

const MAKER = '019a0000-0000-7000-8000-0000000000a1';
const OWNER = '019a0000-0000-7000-8000-0000000000b1';

describe('yêu cầu kiểm định', () => {
  it('inspectionId suy ra từ UUID yêu cầu và đọc ngược lại được', () => {
    const request = '019a0000-0000-7000-8000-0000000000e1';
    expect(inspectionIdOf(request)).toBe(partyIdFromUuid(request));
    expect(requestIdOf(inspectionIdOf(request))).toBe(request);
    expect(requestIdOf(`0x${'ff'.repeat(32)}`)).toBeNull();
  });

  it('người gửi là nhà phát hành hay chủ sở hữu', () => {
    expect(requesterRoleOf({ requestedByPartyId: MAKER }, MAKER)).toBe('MANUFACTURER');
    expect(requesterRoleOf({ requestedByPartyId: OWNER }, MAKER)).toBe('OWNER');
  });

  it('nhà phát hành gửi được ở mọi trạng thái còn hoạt động; chủ sở hữu chỉ khi đang sở hữu', () => {
    const product = { issuerOrgId: MAKER, currentOwnerPartyId: OWNER };
    expect(requesterStillAllowed(MAKER, { ...product, productState: 'IN_DISTRIBUTION' })).toBe(
      true,
    );
    expect(requesterStillAllowed(OWNER, { ...product, productState: 'SOLD' })).toBe(true);
    expect(requesterStillAllowed(OWNER, { ...product, productState: 'AT_RETAIL' })).toBe(false);
    expect(
      requesterStillAllowed(OWNER, {
        ...product,
        productState: 'SOLD',
        currentOwnerPartyId: MAKER,
      }),
    ).toBe(false);
    expect(requesterStillAllowed(MAKER, { ...product, productState: 'RECALLED' })).toBe(false);
  });
});
