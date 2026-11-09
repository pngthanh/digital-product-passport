import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  PayloadTooLargeException,
} from '@nestjs/common';
import { EVIDENCE_MAX_BYTES } from '@dpp/shared';
import { EvidenceFileError } from '../files/evidence-file.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

/** Giới hạn multer cho form có một file biên bản. */
export const EVIDENCE_UPLOAD_LIMITS = { fileSize: EVIDENCE_MAX_BYTES, files: 1, fields: 10 };

/** File quá giới hạn bị multer chặn (413): trả cùng thông báo tiếng Việt như file sai loại. */
@Catch(PayloadTooLargeException)
export class EvidenceTooLargeFilter implements ExceptionFilter {
  private readonly inner = new HttpExceptionFilter();

  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    this.inner.catch(new EvidenceFileError(), host);
  }
}
