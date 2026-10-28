import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { DomainError, type DomainErrorKind } from '../domain/domain-error.js';
import { REQUEST_ID_HEADER } from './request-id.middleware.js';

const SERVER_ERROR_STATUS = 500;

/** Ánh xạ loại lỗi nghiệp vụ sang mã HTTP; chỉ tầng presentation biết tới HTTP. */
const DOMAIN_ERROR_STATUS: Readonly<Record<DomainErrorKind, number>> = {
  invalid: HttpStatus.UNPROCESSABLE_ENTITY,
  unauthenticated: HttpStatus.UNAUTHORIZED,
  forbidden: HttpStatus.FORBIDDEN,
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  unavailable: HttpStatus.SERVICE_UNAVAILABLE,
};

export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string;
  code?: string;
  details?: unknown;
  path: string;
  requestId: string | null;
  timestamp: string;
}

/** Chuẩn hoá mọi lỗi HTTP về một định dạng; lỗi không lường trước không lộ chi tiết nội bộ. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = request.header(REQUEST_ID_HEADER) ?? null;

    const body = this.toBody(exception, request.originalUrl, requestId);
    if (body.statusCode >= SERVER_ERROR_STATUS) {
      this.logger.error(
        `${request.method} ${request.originalUrl} [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    response.status(body.statusCode).json(body);
  }

  toBody(exception: unknown, path: string, requestId: string | null): ErrorResponseBody {
    const base = { path, requestId, timestamp: new Date().toISOString() };

    if (exception instanceof DomainError) {
      const statusCode = DOMAIN_ERROR_STATUS[exception.kind];
      return {
        ...base,
        statusCode,
        error: STATUS_CODES[statusCode] ?? 'Error',
        message: exception.message,
        code: exception.code,
        ...(exception.details === undefined ? {} : { details: exception.details }),
      };
    }

    if (!(exception instanceof HttpException)) {
      return {
        ...base,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: STATUS_CODES[HttpStatus.INTERNAL_SERVER_ERROR] ?? 'Internal Server Error',
        message:
          'Hệ thống gặp lỗi ngoài dự kiến. Hãy thử lại hoặc báo quản trị viên kèm mã yêu cầu.',
      };
    }

    const statusCode = exception.getStatus();
    const payload = exception.getResponse();
    const error = STATUS_CODES[statusCode] ?? 'Error';

    if (typeof payload === 'string') {
      return { ...base, statusCode, error, message: payload };
    }

    const message = 'message' in payload ? payload.message : undefined;
    const details = 'details' in payload ? payload.details : undefined;
    return {
      ...base,
      statusCode,
      error,
      message: formatMessage(message) ?? exception.message,
      ...(details === undefined ? {} : { details }),
    };
  }
}

function formatMessage(message: unknown): string | undefined {
  if (typeof message === 'string') {
    return message;
  }
  if (Array.isArray(message) && message.every((item) => typeof item === 'string')) {
    return message.join('; ');
  }
  return undefined;
}
