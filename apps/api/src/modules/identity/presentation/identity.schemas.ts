import { EMAIL_MAX_LENGTH, FULL_NAME_MAX_LENGTH, PASSWORD_MAX_LENGTH } from '@dpp/shared';
import { z } from 'zod';

const email = z
  .string('Nhập email')
  .trim()
  .max(EMAIL_MAX_LENGTH, `Email tối đa ${EMAIL_MAX_LENGTH} ký tự`)
  .pipe(z.email('Email không hợp lệ'));

/** Độ dài tối thiểu do domain kiểm tra (password-policy); ở đây chặn chuỗi quá dài trước khi băm. */
const password = z
  .string('Nhập mật khẩu')
  .min(1, 'Nhập mật khẩu')
  .max(PASSWORD_MAX_LENGTH, `Mật khẩu tối đa ${PASSWORD_MAX_LENGTH} ký tự`);

export const registerSchema = z.object({
  email,
  password,
  fullName: z
    .string('Nhập họ tên')
    .trim()
    .min(1, 'Nhập họ tên')
    .max(FULL_NAME_MAX_LENGTH, `Họ tên tối đa ${FULL_NAME_MAX_LENGTH} ký tự`),
});

export const signInSchema = z.object({ email, password });

export type RegisterBody = z.infer<typeof registerSchema>;
export type SignInBody = z.infer<typeof signInSchema>;

export const walletChallengeSchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Địa chỉ ví không hợp lệ'),
  purpose: z.enum(['LINK', 'ROTATE'], 'Mục đích phải là LINK hoặc ROTATE'),
});

export const walletAuthorizationSchema = z.object({
  challengeToken: z.string().min(1).max(4096),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/, 'Chữ ký không hợp lệ'),
  password: password.optional(),
});

export const walletTransactionSchema = z.object({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Mã giao dịch không hợp lệ'),
});

export const walletIdSchema = z.uuid('Mã ví không hợp lệ');

export type WalletChallengeBody = z.infer<typeof walletChallengeSchema>;
export type WalletAuthorizationBody = z.infer<typeof walletAuthorizationSchema>;
export type WalletTransactionBody = z.infer<typeof walletTransactionSchema>;
