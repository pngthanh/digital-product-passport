/** Object tra cứu dạng `{ A: 'A', B: 'B' }` sinh từ danh sách giá trị. */
export type EnumObject<T extends readonly string[]> = { readonly [K in T[number]]: K };

/** Kiểu hợp (union) các giá trị của một enum object. */
export type EnumValue<T> = T[keyof T];

/**
 * Tạo enum dạng hằng (thay cho `enum` của TypeScript) để giữ được tên giá trị
 * giống hệt PostgreSQL enum và dùng được cả ở runtime lẫn ở kiểu.
 */
export function defineEnum<const T extends readonly string[]>(values: T): EnumObject<T> {
  const result: Record<string, string> = {};
  for (const value of values) {
    result[value] = value;
  }
  return Object.freeze(result) as EnumObject<T>;
}

/** Trả về danh sách giá trị theo đúng thứ tự khai báo. */
export function enumValues<T extends Record<string, string>>(enumObject: T): Array<T[keyof T]> {
  return Object.values(enumObject) as Array<T[keyof T]>;
}
