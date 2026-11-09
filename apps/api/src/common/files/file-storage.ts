/** Kho file biên bản (ảnh, PDF). Khoá file do module quyết định, không chứa đường dẫn tuyệt đối. */
export interface FileStorage {
  save(key: string, content: Buffer): Promise<void>;
  /** `null` khi file không còn. */
  read(key: string): Promise<Buffer | null>;
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');
