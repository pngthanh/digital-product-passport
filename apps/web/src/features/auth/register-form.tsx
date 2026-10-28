'use client';

import { PASSWORD_MIN_LENGTH } from '@dpp/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { ApiError, apiRequest } from '@/lib/api-client';
import {
  type FieldErrors,
  fieldErrorsOf,
  formValues,
  registerFormSchema,
} from './auth-form.schema';
import { FormAlert } from './form-alert';
import { identitySnapshotSchema } from './identity.schema';

/** ACC-01: tạo tài khoản (Web2). Ví MetaMask được liên kết sau, ở trang Tài khoản. */
export function RegisterForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = registerFormSchema.safeParse(formValues(event.currentTarget));
    if (!parsed.success) {
      setFieldErrors(fieldErrorsOf(parsed.error));
      return;
    }
    setFieldErrors({});
    setFormError(null);
    const { fullName, email, password } = parsed.data;
    startTransition(async () => {
      try {
        await apiRequest('/auth/register', identitySnapshotSchema, {
          method: 'POST',
          body: { fullName, email, password },
        });
        router.replace('/account');
        router.refresh();
      } catch (error) {
        if (error instanceof ApiError) {
          setFieldErrors(
            error.code === 'EMAIL_TAKEN' ? { email: error.message } : error.fieldErrors,
          );
          setFormError(error.code === 'EMAIL_TAKEN' ? null : error.message);
          return;
        }
        setFormError('Đăng ký không thành công.');
      }
    });
  }

  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-5">
      <Field label="Họ và tên" error={fieldErrors.fullName}>
        {(control) => <Input {...control} name="fullName" autoComplete="name" />}
      </Field>
      <Field label="Email" error={fieldErrors.email}>
        {(control) => (
          <Input {...control} name="email" type="email" autoComplete="email" inputMode="email" />
        )}
      </Field>
      <Field
        label="Mật khẩu"
        help={`Ít nhất ${PASSWORD_MIN_LENGTH} ký tự. Cụm từ dài dễ nhớ an toàn hơn chuỗi ngắn phức tạp.`}
        error={fieldErrors.password}
      >
        {(control) => (
          <Input {...control} name="password" type="password" autoComplete="new-password" />
        )}
      </Field>
      <Field label="Nhập lại mật khẩu" error={fieldErrors.confirmPassword}>
        {(control) => (
          <Input {...control} name="confirmPassword" type="password" autoComplete="new-password" />
        )}
      </Field>
      <FormAlert message={formError} />
      <Button type="submit" disabled={pending}>
        {pending ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}
      </Button>
    </form>
  );
}
