import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AppConfigService } from '../../config/app-config.service.js';
import type { ErrorResponseBody } from './http-exception.filter.js';
import { REQUEST_ID_HEADER } from './request-id.middleware.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const FORBIDDEN = 403;

/**
 * Chống CSRF cho phiên lưu trong cookie: request ghi dữ liệu từ trình duyệt phải đến từ đúng
 * origin của web. Request không có header Origin (curl, server-to-server) đi tiếp vì không
 * do trình duyệt gửi kèm cookie một cách ngầm định.
 */
@Injectable()
export class OriginCheckMiddleware implements NestMiddleware {
  private readonly allowedOrigin: string;

  constructor(config: AppConfigService) {
    this.allowedOrigin = new URL(config.webOrigin).origin;
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const origin = req.header('origin');
    if (SAFE_METHODS.has(req.method) || origin === undefined || origin === this.allowedOrigin) {
      next();
      return;
    }
    const body: ErrorResponseBody = {
      statusCode: FORBIDDEN,
      error: 'Forbidden',
      code: 'ORIGIN_NOT_ALLOWED',
      message: 'Yêu cầu không xuất phát từ trang web của hệ thống.',
      path: req.originalUrl,
      requestId: req.header(REQUEST_ID_HEADER) ?? null,
      timestamp: new Date().toISOString(),
    };
    res.status(FORBIDDEN).json(body);
  }
}
