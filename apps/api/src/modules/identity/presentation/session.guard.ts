import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { ResolveSession } from '../application/resolve-session.use-case.js';
import { SessionRequiredError } from '../domain/identity.errors.js';
import type { AuthenticatedUser } from '../domain/user-account.js';
import { readSessionCookie } from './session-cookie.js';

interface SessionRequest extends Request {
  authenticatedUser?: AuthenticatedUser;
}

/** Bảo vệ route cần đăng nhập; module khác dùng qua `@UseGuards(SessionGuard)`. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly resolveSession: ResolveSession) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    const user = await this.resolveSession.execute(readSessionCookie(request));
    if (!user) {
      throw new SessionRequiredError();
    }
    request.authenticatedUser = user;
    return true;
  }
}

/** Người dùng đã qua SessionGuard: `@CurrentUser() user: AuthenticatedUser`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const user = context.switchToHttp().getRequest<SessionRequest>().authenticatedUser;
    if (!user) {
      throw new SessionRequiredError();
    }
    return user;
  },
);
