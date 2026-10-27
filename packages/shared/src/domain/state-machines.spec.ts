import { describe, expect, it } from 'vitest';
import { enumValues } from './define-enum.js';
import { ProductState, ServiceState, TransferState, WarrantyState } from './enums.js';
import {
  canTransition,
  isTerminalState,
  PRODUCT_STATE_TRANSITIONS,
  SERVICE_STATE_TRANSITIONS,
  TRANSFER_STATE_TRANSITIONS,
  WARRANTY_STATE_TRANSITIONS,
} from './state-machines.js';

describe('4 state machine độc lập', () => {
  it('mỗi bảng chuyển trạng thái phủ đủ mọi giá trị enum', () => {
    expect(Object.keys(PRODUCT_STATE_TRANSITIONS).toSorted()).toEqual(
      enumValues(ProductState).toSorted(),
    );
    expect(Object.keys(WARRANTY_STATE_TRANSITIONS).toSorted()).toEqual(
      enumValues(WarrantyState).toSorted(),
    );
    expect(Object.keys(SERVICE_STATE_TRANSITIONS).toSorted()).toEqual(
      enumValues(ServiceState).toSorted(),
    );
    expect(Object.keys(TRANSFER_STATE_TRANSITIONS).toSorted()).toEqual(
      enumValues(TransferState).toSorted(),
    );
  });

  it('bàn giao custody không nhảy thẳng tới SOLD', () => {
    expect(canTransition(PRODUCT_STATE_TRANSITIONS, 'CREATED', 'IN_DISTRIBUTION')).toBe(true);
    expect(canTransition(PRODUCT_STATE_TRANSITIONS, 'CREATED', 'SOLD')).toBe(false);
    expect(canTransition(PRODUCT_STATE_TRANSITIONS, 'AT_RETAIL', 'SOLD')).toBe(true);
  });

  it('chỉ REQUESTED là trạng thái mở của transfer request', () => {
    const openStates = enumValues(TransferState).filter(
      (state) => !isTerminalState(TRANSFER_STATE_TRANSITIONS, state),
    );
    expect(openStates).toEqual(['REQUESTED']);
  });

  it('phiếu dịch vụ đã đóng không mở lại được', () => {
    expect(isTerminalState(SERVICE_STATE_TRANSITIONS, 'REPAIRED')).toBe(true);
    expect(canTransition(SERVICE_STATE_TRANSITIONS, 'REJECTED', 'IN_REPAIR')).toBe(false);
  });
});
