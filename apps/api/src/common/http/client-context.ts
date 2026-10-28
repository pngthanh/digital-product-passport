import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { ClientContext } from '../domain/client-context.js';

const USER_AGENT_MAX_LENGTH = 500;

export function clientContextOf(req: Request): ClientContext {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.header('user-agent')?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
  };
}

/** Tham số controller: `@Client() client: ClientContext`. */
export const Client = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ClientContext =>
    clientContextOf(context.switchToHttp().getRequest<Request>()),
);
