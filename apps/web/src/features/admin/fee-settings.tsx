'use client';

import { formatMon, parseMon } from '@dpp/shared';
import { isAddress } from 'ethers';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { describeWalletError } from '@/lib/wallet/wallet-errors';
import { FormAlert } from '../auth/form-alert';
import { type AdminContext, updateRegistrationFee, updateTreasury } from './admin-flows';

function readMon(value: FormDataEntryValue | null): bigint | null {
  if (typeof value !== 'string' || !/^\d+(\.\d{1,18})?$/.test(value.trim())) {
    return null;
  }
  return parseMon(value);
}

/** ORG-06: Admin đổi phí đăng ký và ví Treasury bằng ví có quyền Admin trên contract. */
export function FeeSettings({
  context,
  currentFeeWei,
  currentTreasury,
}: {
  context: AdminContext;
  currentFeeWei: string | null;
  currentTreasury: string | null;
}) {
  const router = useRouter();
  const [running, setRunning] = useState<'fee' | 'treasury' | null>(null);
  const [errors, setErrors] = useState<{ fee?: string; treasury?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function run(kind: 'fee' | 'treasury', action: () => Promise<void>) {
    setRunning(kind);
    setFormError(null);
    try {
      await action();
      router.refresh();
    } catch (failure) {
      setFormError(describeWalletError(failure));
    } finally {
      setRunning(null);
    }
  }

  function onFee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = readMon(new FormData(event.currentTarget).get('fee'));
    if (amount === null) {
      setErrors({ fee: 'Nhập số MON, ví dụ 8 hoặc 0.5' });
      return;
    }
    setErrors({});
    void run('fee', () => updateRegistrationFee(context, amount));
  }

  function onTreasury(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('treasury');
    if (typeof value !== 'string' || !isAddress(value.trim())) {
      setErrors({ treasury: 'Địa chỉ ví không hợp lệ' });
      return;
    }
    setErrors({});
    void run('treasury', () => updateTreasury(context, value.trim()));
  }

  return (
    <div className="grid gap-5">
      <form noValidate onSubmit={onFee} className="grid gap-3">
        <Field
          label="Phí đăng ký doanh nghiệp (MON)"
          help="Đơn đang chờ duyệt giữ nguyên phí đã nộp."
          error={errors.fee}
        >
          {(control) => (
            <Input
              {...control}
              name="fee"
              inputMode="decimal"
              defaultValue={currentFeeWei ? formatMon(BigInt(currentFeeWei), 18) : ''}
            />
          )}
        </Field>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={running !== null}
          className="justify-self-start"
        >
          {running === 'fee' ? 'Đang cập nhật…' : 'Đổi phí'}
        </Button>
      </form>
      <form noValidate onSubmit={onTreasury} className="grid gap-3 border-t border-line pt-5">
        <Field label="Ví Treasury" help="Nhận phí khi đơn được duyệt." error={errors.treasury}>
          {(control) => (
            <Input
              {...control}
              name="treasury"
              className="font-mono text-[13px]"
              defaultValue={currentTreasury ?? ''}
            />
          )}
        </Field>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={running !== null}
          className="justify-self-start"
        >
          {running === 'treasury' ? 'Đang cập nhật…' : 'Đổi ví Treasury'}
        </Button>
      </form>
      <FormAlert message={formError} />
    </div>
  );
}
