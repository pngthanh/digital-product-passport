export interface SessionClaims {
  userId: string;
  sessionVersion: number;
}

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

/** JWT phiên đăng nhập (lưu trong cookie httpOnly). */
export interface SessionTokens {
  issue(claims: SessionClaims): Promise<IssuedSession>;
  /** `null` khi token sai chữ ký, hết hạn hoặc sai mục đích. */
  verify(token: string): Promise<SessionClaims | null>;
}

export const SESSION_TOKENS = Symbol('SESSION_TOKENS');
