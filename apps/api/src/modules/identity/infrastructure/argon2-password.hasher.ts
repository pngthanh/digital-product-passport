import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import type { PasswordHasher } from '../application/ports/password-hasher.port.js';

/**
 * Tham số Argon2id theo khuyến nghị OWASP (Password Storage Cheat Sheet):
 * bộ nhớ 19 MiB, 2 vòng lặp, 1 luồng. Thuật toán mặc định của thư viện là Argon2id
 * (test kiểm tra tiền tố `$argon2id$`); salt 16 byte ngẫu nhiên được sinh cho mỗi lần băm.
 */
export const ARGON2ID_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return hash(password, ARGON2ID_OPTIONS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  async verifyDummy(password: string): Promise<void> {
    this.dummyHash ??= hash(randomBytes(32).toString('hex'), ARGON2ID_OPTIONS);
    await this.verify(await this.dummyHash, password);
  }
}
