import type { CookieOptions, Request, Response } from 'express';
import type { SessionConfig } from '../../../config/app-config.service.js';
import type { IssuedSession } from '../application/ports/session-tokens.port.js';

export const SESSION_COOKIE = 'dpp_session';

/** httpOnly: JavaScript trên trang không đọc được token; SameSite=Lax chặn gửi kèm từ site khác. */
function baseOptions(config: SessionConfig): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: config.secureCookie, path: '/' };
}

export function readSessionCookie(req: Request): string | undefined {
  const cookies: unknown = req.cookies;
  if (typeof cookies !== 'object' || cookies === null || !(SESSION_COOKIE in cookies)) {
    return undefined;
  }
  const value: unknown = Reflect.get(cookies, SESSION_COOKIE);
  return typeof value === 'string' ? value : undefined;
}

export function setSessionCookie(
  res: Response,
  session: IssuedSession,
  config: SessionConfig,
): void {
  res.cookie(SESSION_COOKIE, session.token, { ...baseOptions(config), expires: session.expiresAt });
}

export function clearSessionCookie(res: Response, config: SessionConfig): void {
  res.clearCookie(SESSION_COOKIE, baseOptions(config));
}
