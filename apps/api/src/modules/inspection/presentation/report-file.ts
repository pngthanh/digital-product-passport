import { StreamableFile } from '@nestjs/common';
import type { ReportDownload } from '../application/inspection-commands.js';

/** File biên bản mở ngay trong trình duyệt (ảnh, PDF). */
export function reportFile(file: ReportDownload): StreamableFile {
  return new StreamableFile(file.content, {
    type: file.mimeType,
    disposition: `inline; filename="${file.fileName}"`,
    length: file.content.length,
  });
}
