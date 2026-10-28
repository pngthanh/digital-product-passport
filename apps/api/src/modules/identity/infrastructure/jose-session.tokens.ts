import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import { AppConfigService } from '../../../config/app-config.service.js';
import type {
  IssuedSession,
  SessionClaims,
  SessionTokens,
} from '../application/ports/session-tokens.port.js';
import { JwtCodec } from './jwt-codec.js';

/** JWT phiên đăng nhập; claim `sv` là session_version tại lúc cấp. */
@Injectable()
export class JoseSessionTokens implements SessionTokens {
  private readonly codec: JwtCodec;
  private readonly ttlMs: number;

  constructor(
    config: AppConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.codec = new JwtCodec(config.session.jwtSecret, 'dpp-session');
    this.ttlMs = config.session.ttlMinutes * 60_000;
  }

  async issue(claims: SessionClaims): Promise<IssuedSession> {
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + this.ttlMs);
    const token = await this.codec.sign(
      { sv: claims.sessionVersion },
      claims.userId,
      now,
      expiresAt,
    );
    return { token, expiresAt };
  }

  async verify(token: string): Promise<SessionClaims | null> {
    const payload = await this.codec.verify(token, this.clock.now());
    if (!payload || !Number.isInteger(payload.sv)) {
      return null;
    }
    return { userId: payload.sub, sessionVersion: Number(payload.sv) };
  }
}
