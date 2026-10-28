import 'server-only';
import type { IdentitySnapshot } from '@dpp/shared';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { serverApiUrl } from '@/lib/env';
import { identitySnapshotSchema } from './identity.schema';

const REQUEST_TIMEOUT_MS = 5000;

/**
 * Người dùng đang đăng nhập (gọi GET /auth/me kèm cookie của request hiện tại).
 * `null` khi chưa đăng nhập, phiên hết hạn hoặc API không trả lời. Gom một lần gọi mỗi request.
 */
export const getIdentity = cache(async (): Promise<IdentitySnapshot | null> => {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader.includes('dpp_session=')) {
    return null;
  }
  try {
    const response = await fetch(`${serverApiUrl()}/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    const parsed = identitySnapshotSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
});
