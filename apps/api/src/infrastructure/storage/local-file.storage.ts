import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import type { FileStorage } from '../../common/files/file-storage.js';
import { AppConfigService } from '../../config/app-config.service.js';

const SAFE_KEY = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*\.[a-z0-9]+$/;

/**
 * Lưu file biên bản trên ổ đĩa máy chủ, trong UPLOAD_DIR (không commit, không phục vụ tĩnh). Khoá
 * chỉ gồm chữ thường, số, gạch nối và gạch chéo, nên không thoát ra ngoài thư mục được.
 */
@Injectable()
export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(config: AppConfigService) {
    this.root = config.uploadDir;
  }

  async save(key: string, content: Buffer): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    // Ghi file tạm rồi đổi tên: không để lại file ghi dở khi tiến trình dừng giữa chừng.
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, content);
    await rename(temporary, path);
  }

  async read(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathOf(key));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  private pathOf(key: string): string {
    const path = resolve(this.root, key);
    if (!SAFE_KEY.test(key) || relative(this.root, path).startsWith('..')) {
      throw new Error(`Khoá file không hợp lệ: ${key}`);
    }
    return path;
  }
}
