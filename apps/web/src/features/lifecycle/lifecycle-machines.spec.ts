import { canTransition } from '@dpp/shared';
import { describe, expect, it } from 'vitest';
import { LIFECYCLE_MACHINES } from './lifecycle-machines';

/* Giao diện không được vẽ một bước chuyển mà state machine dùng chung không cho phép. */
describe('LIFECYCLE_MACHINES', () => {
  it.each(LIFECYCLE_MACHINES.map((machine) => [machine.title, machine] as const))(
    '%s: mọi bước trên đường chính đều hợp lệ',
    (_title, machine) => {
      for (let index = 1; index < machine.mainPath.length; index += 1) {
        const from = machine.mainPath[index - 1]!;
        const to = machine.mainPath[index]!;
        expect(canTransition(machine.transitions, from, to)).toBe(true);
      }
    },
  );

  it.each(LIFECYCLE_MACHINES.map((machine) => [machine.title, machine] as const))(
    '%s: mọi trạng thái đều có nhãn tiếng Việt',
    (_title, machine) => {
      for (const state of Object.keys(machine.transitions)) {
        expect(machine.labels[state]?.label).toBeTruthy();
      }
    },
  );
});
