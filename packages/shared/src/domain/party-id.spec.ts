import { describe, expect, it } from 'vitest';
import { InvalidPartyIdError, partyIdFromUuid, uuidFromPartyId } from './party-id.js';

const PARTY_UUID = '0199a3b2-7c4d-7e8f-9a0b-1c2d3e4f5a6b';

describe('partyId', () => {
  it('đặt UUID vào 16 byte thấp của bytes32', () => {
    expect(partyIdFromUuid(PARTY_UUID)).toBe(
      '0x000000000000000000000000000000000199a3b27c4d7e8f9a0b1c2d3e4f5a6b',
    );
  });

  it('chuyển đổi hai chiều không mất thông tin', () => {
    expect(uuidFromPartyId(partyIdFromUuid(PARTY_UUID))).toBe(PARTY_UUID);
    expect(uuidFromPartyId(partyIdFromUuid(PARTY_UUID.toUpperCase()))).toBe(PARTY_UUID);
  });

  it('từ chối UUID sai định dạng', () => {
    expect(() => partyIdFromUuid('not-a-uuid')).toThrow(InvalidPartyIdError);
  });

  it('từ chối bytes32 không do hệ thống sinh ra', () => {
    expect(() => uuidFromPartyId(`0x${'ab'.repeat(32)}`)).toThrow(InvalidPartyIdError);
    expect(() => uuidFromPartyId('0x1234')).toThrow(InvalidPartyIdError);
  });
});
