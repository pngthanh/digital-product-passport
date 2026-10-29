'use client';

import { todayInVietnam, WARRANTY_MONTHS_MAX } from '@dpp/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { StepList } from '@/components/ui/step-list';
import { ApiError } from '@/lib/api-error';
import { type FieldErrors, fieldErrorsOf, formValues } from '@/lib/form';
import { describeWalletError } from '@/lib/wallet/wallet-errors';
import { FormAlert } from '../auth/form-alert';
import {
  REGISTER_STEPS,
  type RegisteredProduct,
  type RegisterStep,
  registerProducts,
  registerStepLabels,
} from './product-flows';
import { productFormSchema } from './product.schema';
import { SavedDraftsRetry } from './saved-drafts-retry';

/** PRD-01: đăng ký một sản phẩm; ví cá nhân của người đại diện ký và trả gas qua MetaMask. */
export function ProductForm({ chainId }: { chainId: number }) {
  const router = useRouter();
  const [step, setStep] = useState<RegisterStep | 'done' | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<RegisteredProduct[] | null>(null);
  const running = step !== null && step !== 'done';

  function openProduct(products: readonly RegisteredProduct[]) {
    const [product] = products;
    if (product) {
      router.push(`/products/${product.id}`);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = productFormSchema.safeParse(formValues(event.currentTarget));
    if (!parsed.success) {
      setFieldErrors(fieldErrorsOf(parsed.error));
      return;
    }
    setFieldErrors({});
    setFormError(null);
    setDrafts(null);
    let saved: RegisteredProduct[] | null = null;
    try {
      const products = await registerProducts([parsed.data], chainId, setStep, (created) => {
        saved = created;
      });
      setStep('done');
      openProduct(products);
    } catch (error) {
      setStep(null);
      if (error instanceof ApiError && error.code === 'SERIAL_TAKEN') {
        setFieldErrors({
          serialNumber:
            'Serial này đã có trong danh sách sản phẩm của doanh nghiệp (kể cả bản nháp chưa ghi).',
        });
        return;
      }
      setFormError(describeWalletError(error));
      setDrafts(saved);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Serial"
          help="In trên thân máy. Chữ, số và . _ / -, không phân biệt hoa thường."
          error={fieldErrors.serialNumber}
        >
          {(props) => (
            <Input
              {...props}
              name="serialNumber"
              autoComplete="off"
              placeholder="LSV-2026-000001"
            />
          )}
        </Field>
        <Field label="Tên model" error={fieldErrors.modelName}>
          {(props) => (
            <Input {...props} name="modelName" placeholder="Máy lọc không khí LSV Air 300" />
          )}
        </Field>
        <Field label="Ngày sản xuất" error={fieldErrors.manufacturedOn}>
          {(props) => <Input {...props} name="manufacturedOn" type="date" max={todayInVietnam()} />}
        </Field>
        <Field
          label="Bảo hành (tháng)"
          help="0 là không bảo hành. Bảo hành tính từ ngày bán."
          error={fieldErrors.warrantyMonths}
        >
          {(props) => (
            <Input
              {...props}
              name="warrantyMonths"
              type="number"
              inputMode="numeric"
              min={0}
              max={WARRANTY_MONTHS_MAX}
              defaultValue={12}
            />
          )}
        </Field>
      </div>
      <Field label="Mô tả (không bắt buộc)" error={fieldErrors.description}>
        {(props) => (
          <Textarea
            {...props}
            name="description"
            rows={3}
            placeholder="Màu sắc, cấu hình, lô sản xuất..."
          />
        )}
      </Field>
      <p className="text-sm text-muted">
        Hồ sơ được băm và ghi lên blockchain nên sau khi ghi không sửa được. Kiểm tra kỹ trước khi
        gửi.
      </p>

      {step && step !== 'done' ? (
        <StepList
          label="Tiến trình đăng ký sản phẩm"
          steps={REGISTER_STEPS}
          current={step}
          labels={registerStepLabels(1)}
        />
      ) : null}
      <FormAlert message={formError} />

      {drafts ? (
        <SavedDraftsRetry drafts={drafts} chainId={chainId} onRegistered={openProduct} />
      ) : (
        <Button type="submit" disabled={running} className="justify-self-start">
          {running ? 'Đang xử lý…' : 'Lưu và ghi lên blockchain'}
        </Button>
      )}
    </form>
  );
}
