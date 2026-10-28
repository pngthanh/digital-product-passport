import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { IdentitySnapshot } from '@dpp/shared';
import type { Request, Response } from 'express';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { Client } from '../../../common/http/client-context.js';
import { ZodValidationPipe } from '../../../common/http/zod-validation.pipe.js';
import { AppConfigService } from '../../../config/app-config.service.js';
import { GetIdentity } from '../application/get-identity.query.js';
import { RegisterAccount } from '../application/register-account.use-case.js';
import { ResolveSession } from '../application/resolve-session.use-case.js';
import { SignIn } from '../application/sign-in.use-case.js';
import { SignOut } from '../application/sign-out.use-case.js';
import type { AuthenticatedUser } from '../domain/user-account.js';
import { presentIdentity } from './identity.presenter.js';
import {
  type RegisterBody,
  registerSchema,
  type SignInBody,
  signInSchema,
} from './identity.schemas.js';
import { clearSessionCookie, readSessionCookie, setSessionCookie } from './session-cookie.js';
import { CurrentUser, SessionGuard } from './session.guard.js';

/** ACC-01, ACC-02: đăng ký, đăng nhập, đăng xuất và xem hồ sơ của chính mình. */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerAccount: RegisterAccount,
    private readonly signIn: SignIn,
    private readonly signOut: SignOut,
    private readonly resolveSession: ResolveSession,
    private readonly getIdentity: GetIdentity,
    private readonly config: AppConfigService,
  ) {}

  @Post('register')
  @HttpCode(201)
  @UseGuards(ThrottlerGuard)
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterBody,
    @Client() client: ClientContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<IdentitySnapshot> {
    const { account, session } = await this.registerAccount.execute(body, client);
    setSessionCookie(res, session, this.config.session);
    return presentIdentity(await this.getIdentity.execute(account.id));
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  async login(
    @Body(new ZodValidationPipe(signInSchema)) body: SignInBody,
    @Client() client: ClientContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<IdentitySnapshot> {
    const { account, session } = await this.signIn.execute(body, client);
    setSessionCookie(res, session, this.config.session);
    return presentIdentity(await this.getIdentity.execute(account.id));
  }

  /** Luôn xoá cookie; nếu phiên còn hợp lệ thì thu hồi mọi phiên của tài khoản. */
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Client() client: ClientContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const user = await this.resolveSession.execute(readSessionCookie(req));
    if (user) {
      await this.signOut.execute(user.id, client);
    }
    clearSessionCookie(res, this.config.session);
  }

  @Get('me')
  @UseGuards(SessionGuard)
  async me(@CurrentUser() user: AuthenticatedUser): Promise<IdentitySnapshot> {
    return presentIdentity(await this.getIdentity.execute(user.id));
  }
}
