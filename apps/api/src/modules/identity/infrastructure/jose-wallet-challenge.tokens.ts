import { Inject, Injectable } from '@nestjs/common';
import type { WalletLinkPurpose } from '@dpp/shared';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import { AppConfigService } from '../../../config/app-config.service.js';
import type {
  WalletChallengeClaims,
  WalletChallengeTokens,
} from '../application/ports/wallet-challenge-tokens.port.js';
import { JwtCodec } from './jwt-codec.js';

function isPurpose(value: unknown): value is WalletLinkPurpose {
  return value === 'LINK' || value === 'ROTATE';
}

/** Challenge EIP-4361 không lưu CSDL: mọi trường của thông điệp nằm trong token đã ký. */
@Injectable()
export class JoseWalletChallengeTokens implements WalletChallengeTokens {
  private readonly codec: JwtCodec;

  constructor(
    config: AppConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.codec = new JwtCodec(config.session.jwtSecret, 'dpp-wallet-link');
  }

  issue(claims: WalletChallengeClaims): Promise<string> {
    return this.codec.sign(
      {
        addr: claims.address,
        pur: claims.purpose,
        non: claims.nonce,
        isa: claims.issuedAt,
        sxp: claims.expirationTime,
      },
      claims.userId,
      new Date(claims.issuedAt),
      new Date(claims.expirationTime),
    );
  }

  async verify(token: string): Promise<WalletChallengeClaims | null> {
    const payload = await this.codec.verify(token, this.clock.now());
    if (!payload) {
      return null;
    }
    const { addr, pur, non, isa, sxp } = payload;
    if (
      typeof addr !== 'string' ||
      !isPurpose(pur) ||
      typeof non !== 'string' ||
      typeof isa !== 'string' ||
      typeof sxp !== 'string'
    ) {
      return null;
    }
    return {
      userId: payload.sub,
      address: addr,
      purpose: pur,
      nonce: non,
      issuedAt: isa,
      expirationTime: sxp,
    };
  }
}
