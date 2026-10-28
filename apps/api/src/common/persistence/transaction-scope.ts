/**
 * Giao dịch CSDL đang mở, truyền qua tầng application dưới dạng "hộp kín": application chỉ
 * chuyển tiếp, không biết bên trong là gì; chỉ tầng infrastructure mở ra (xem `prisma-scope.ts`).
 */
export class TransactionScope {
  constructor(readonly handle: object) {}
}

/** Chạy một khối thao tác trong cùng một giao dịch CSDL. */
export interface UnitOfWork {
  run<T>(work: (scope: TransactionScope) => Promise<T>): Promise<T>;
}

export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');
