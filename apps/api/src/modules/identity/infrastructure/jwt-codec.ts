import { type JWTPayload, jwtVerify, SignJWT } from 'jose';

const ISSUER = 'dpp-api';
const ALGORITHM = 'HS256';

/** Ký và kiểm tra JWT HS256 cho một audience; mỗi loại token dùng audience riêng nên không dùng lẫn được. */
export class JwtCodec {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly audience: string,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  sign(payload: JWTPayload, subject: string, issuedAt: Date, expiresAt: Date): Promise<string> {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
      .setIssuer(ISSUER)
      .setAudience(this.audience)
      .setSubject(subject)
      .setIssuedAt(toSeconds(issuedAt))
      .setExpirationTime(toSeconds(expiresAt))
      .sign(this.key);
  }

  /** `null` khi sai chữ ký, sai audience/issuer, hết hạn hoặc sai định dạng. */
  async verify(token: string, now: Date): Promise<(JWTPayload & { sub: string }) | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: this.audience,
        algorithms: [ALGORITHM],
        currentDate: now,
      });
      return payload.sub ? { ...payload, sub: payload.sub } : null;
    } catch {
      return null;
    }
  }
}

function toSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}
