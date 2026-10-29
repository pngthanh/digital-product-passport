import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AdminRequiredError, SessionRequiredError } from '../domain/identity.errors.js';
import type { AuthenticatedUser } from '../domain/user-account.js';

/** Chỉ tài khoản có system_role ADMIN; đặt sau SessionGuard: `@UseGuards(SessionGuard, AdminGuard)`. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { authenticatedUser?: AuthenticatedUser }>();
    const user = request.authenticatedUser;
    if (!user) {
      throw new SessionRequiredError();
    }
    if (user.systemRole !== 'ADMIN') {
      throw new AdminRequiredError();
    }
    return true;
  }
}
