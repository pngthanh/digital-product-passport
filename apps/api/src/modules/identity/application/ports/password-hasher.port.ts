export interface PasswordHasher {
  /** Băm Argon2id có salt ngẫu nhiên; trả chuỗi PHC `$argon2id$...`. */
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
  /** Tốn thời gian như một lần verify thật, dùng khi email không tồn tại để không lộ email qua thời gian phản hồi. */
  verifyDummy(password: string): Promise<void>;
}

export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
