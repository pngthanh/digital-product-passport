/**
 * Loại lỗi nghiệp vụ theo ngữ nghĩa, không phụ thuộc HTTP.
 * Tầng presentation (bộ lọc lỗi) ánh xạ sang mã trạng thái HTTP.
 */
export type DomainErrorKind =
  'invalid' | 'unauthenticated' | 'forbidden' | 'not_found' | 'conflict' | 'unavailable';

/** Lỗi nghiệp vụ có mã ổn định (`code`) để giao diện hiển thị đúng thông báo. */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly kind: DomainErrorKind;

  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
