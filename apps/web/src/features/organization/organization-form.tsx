'use client';

import { formatMon, type OrganizationSummary, OrgType } from '@dpp/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { StepList } from '@/components/ui/step-list';
import { ApiError } from '@/lib/api-client';
import { type FieldErrors, fieldErrorsOf, formValues } from '@/lib/form';
import { ORG_TYPE_LABELS } from '@/lib/state-labels';
import { describeWalletError } from '@/lib/wallet/wallet-errors';
import { FormAlert } from '../auth/form-alert';
import { APPLY_STEPS, type ApplyStep, applyOrganization } from './organization-flows';
import { organizationFormSchema } from './organization.schema';

/** ORG-01: hồ sơ doanh nghiệp; nộp phí bằng ví cá nhân của người đại diện qua MetaMask. */
export function OrganizationForm({
  initial,
  feeWei,
  chainId,
}: {
  initial: OrganizationSummary | null;
  feeWei: string | null;
  chainId: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState<ApplyStep | 'done' | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const fee = feeWei === null ? null : `${formatMon(BigInt(feeWei))} MON`;
  const running = step !== null && step !== 'done';

  const stepLabels: Record<ApplyStep, string> = {
    save: 'Lưu hồ sơ và nhận giấy phép nộp đơn',
    send: `Ví cá nhân gửi applyOrganization kèm ${fee ?? 'phí đăng ký'}, tự trả gas`,
    confirm: 'Chờ block finalized và hệ thống ghi nhận đơn',
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = organizationFormSchema.safeParse(formValues(event.currentTarget));
    if (!parsed.success) {
      setFieldErrors(fieldErrorsOf(parsed.error));
      return;
    }
    setFieldErrors({});
    setFormError(null);
    const { contactPhone, address, ...profile } = parsed.data;
    try {
      await applyOrganization(
        { ...profile, contactPhone: contactPhone || null, address: address || null },
        chainId,
        setStep,
      );
      setStep('done');
      router.refresh();
    } catch (error) {
      setStep(null);
      if (error instanceof ApiError && error.code === 'TAX_CODE_TAKEN') {
        setFieldErrors({ taxCode: error.message });
        return;
      }
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        setFieldErrors(error.fieldErrors);
      }
      setFormError(describeWalletError(error));
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Tên doanh nghiệp" error={fieldErrors.name}>
            {(control) => (
              <Input
                {...control}
                name="name"
                defaultValue={initial?.name}
                autoComplete="organization"
              />
            )}
          </Field>
        </div>
        <Field label="Mã số thuế" help="10 chữ số; chi nhánh thêm -xxx" error={fieldErrors.taxCode}>
          {(control) => (
            <Input
              {...control}
              name="taxCode"
              defaultValue={initial?.taxCode}
              inputMode="numeric"
            />
          )}
        </Field>
        <Field
          label="Loại doanh nghiệp"
          help="Quyết định quyền ghi lên blockchain sau khi được duyệt"
          error={fieldErrors.orgType}
        >
          {(control) => (
            <Select
              {...control}
              name="orgType"
              defaultValue={initial?.orgType ?? OrgType.MANUFACTURER}
            >
              {Object.values(OrgType).map((type) => (
                <option key={type} value={type}>
                  {ORG_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Email liên hệ" error={fieldErrors.contactEmail}>
          {(control) => (
            <Input
              {...control}
              name="contactEmail"
              type="email"
              inputMode="email"
              defaultValue={initial?.contactEmail}
            />
          )}
        </Field>
        <Field label="Số điện thoại" help="Không bắt buộc" error={fieldErrors.contactPhone}>
          {(control) => (
            <Input
              {...control}
              name="contactPhone"
              type="tel"
              autoComplete="tel"
              defaultValue={initial?.contactPhone ?? ''}
            />
          )}
        </Field>
        <div className="sm:col-span-2">
          <Field label="Địa chỉ" help="Không bắt buộc" error={fieldErrors.address}>
            {(control) => (
              <Input
                {...control}
                name="address"
                autoComplete="street-address"
                defaultValue={initial?.address ?? ''}
              />
            )}
          </Field>
        </div>
      </div>

      <p className="rounded-control bg-tint px-3 py-2.5 text-sm text-tint-ink">
        Phí đăng ký {fee ?? '(đang đồng bộ từ contract)'} cộng phí gas, trả bằng ví cá nhân đã liên
        kết. Contract giữ khoản phí tới khi quản trị viên duyệt; nếu đơn bị từ chối, bạn rút lại
        được toàn bộ.
      </p>

      {step !== null ? (
        <StepList
          label="Tiến trình nộp đơn"
          steps={APPLY_STEPS}
          current={step}
          labels={stepLabels}
        />
      ) : null}
      <FormAlert message={formError} />

      <Button type="submit" disabled={running} className="justify-self-start">
        {running ? 'Đang xử lý…' : `Lưu và nộp ${fee ?? 'phí'}`}
      </Button>
    </form>
  );
}
