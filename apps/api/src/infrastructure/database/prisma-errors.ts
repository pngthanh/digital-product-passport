import { Prisma } from './generated/client.js';

/**
 * Lỗi vi phạm UNIQUE (P2002). Khi truyền `target`, chỉ nhận lỗi của đúng ràng buộc/cột đó,
 * tìm trong toàn bộ `meta` vì driver adapter đặt tên ràng buộc ở vị trí khác nhau.
 */
export function isUniqueViolation(error: unknown, target?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  return target === undefined || JSON.stringify(error.meta ?? {}).includes(target);
}
