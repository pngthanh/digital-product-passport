'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { ApiError, apiRequest } from '@/lib/api-client';
import { type FieldErrors, fieldErrorsOf, formValues, loginFormSchema } from './auth-form.schema';
import { FormAlert } from './form-alert';
import { identitySnapshotSchema } from './identity.schema';

/** ACC-02: đăng nhập bằng email và mật khẩu; API đặt cookie phiên httpOnly. */
export function LoginForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = loginFormSchema.safeParse(formValues(event.currentTarget));
    if (!parsed.success) {
      setFieldErrors(fieldErrorsOf(parsed.error));
      return;
    }
    setFieldErrors({});
    setFormError(null);
    startTransition(async () => {
      try {
        await apiRequest('/auth/login', identitySnapshotSchema, {
          method: 'POST',
          body: parsed.data,
        });
        router.replace('/account');
        router.refresh();
      } catch (error) {
        setFormError(error instanceof ApiError ? error.message : 'Đăng nhập không thành công.');
      }
    });
  }

  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-5">
      <Field label="Email" error={fieldErrors.email}>
        {(control) => (
          <Input {...control} name="email" type="email" autoComplete="email" inputMode="email" />
        )}
      </Field>
      <Field label="Mật khẩu" error={fieldErrors.password}>
        {(control) => (
          <Input {...control} name="password" type="password" autoComplete="current-password" />
        )}
      </Field>
      <FormAlert message={formError} />
      <Button type="submit" disabled={pending}>
        {pending ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </Button>
    </form>
  );
}
