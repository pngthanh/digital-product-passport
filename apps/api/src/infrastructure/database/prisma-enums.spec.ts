import { DOMAIN_ENUMS } from '@dpp/shared';
import * as PrismaEnums from './generated/enums.js';

/*
 * Traceability Database ↔ Code: mọi PostgreSQL enum trong schema.prisma phải khớp
 * (tên và thứ tự giá trị) với enum dùng chung ở packages/shared.
 */
describe('Prisma enum khớp @dpp/shared', () => {
  const prismaEnums: Record<string, Record<string, string>> = { ...PrismaEnums };

  it('hai bên có cùng danh sách enum', () => {
    expect(Object.keys(prismaEnums).toSorted()).toEqual(Object.keys(DOMAIN_ENUMS).toSorted());
  });

  it.each(Object.entries(DOMAIN_ENUMS))('%s có cùng giá trị và thứ tự', (name, sharedEnum) => {
    expect(Object.values(prismaEnums[name] ?? {})).toEqual(Object.values(sharedEnum));
  });
});
