'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { StepList } from '@/components/ui/step-list';
import { describeWalletError } from '@/lib/wallet/wallet-errors';
import { FormAlert } from '../auth/form-alert';
import {
  deleteProductDraft,
  REGISTER_STEPS,
  type RegisterStep,
  registerStepLabels,
  retryProducts,
} from './product-flows';

/** Bản nháp: ghi lại lên blockchain với giấy phép mới, hoặc xoá nếu nhập nhầm (xác nhận hai bước). */
export function DraftActions({ productId, chainId }: { productId: string; chainId: number }) {
  const router = useRouter();
  const [step, setStep] = useState<RegisterStep | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setError(null);
    try {
      await retryProducts([productId], chainId, setStep);
      router.refresh();
    } catch (failure) {
      setError(describeWalletError(failure));
    } finally {
      setStep(null);
    }
  }

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      await deleteProductDraft(productId);
      router.push('/products?filter=DRAFT');
    } catch (failure) {
      setError(describeWalletError(failure));
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">
        Hồ sơ đã lưu nhưng chưa có trên blockchain (ví từ chối ký hoặc giấy phép hết hạn). Mã QR đã
        cấp vẫn giữ nguyên khi gửi lại.
      </p>
      {step ? (
        <StepList
          label="Tiến trình ghi sản phẩm"
          steps={REGISTER_STEPS}
          current={step}
          labels={registerStepLabels(1)}
        />
      ) : null}
      <FormAlert message={error} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={step !== null || busy} onClick={() => void resend()}>
          Ghi lên blockchain
        </Button>
        {confirmingDelete ? (
          <>
            <Button variant="danger" disabled={busy} onClick={() => void remove()}>
              {busy ? 'Đang xoá…' : 'Xác nhận xoá'}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmingDelete(false)}>
              Huỷ
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            disabled={step !== null}
            onClick={() => setConfirmingDelete(true)}
          >
            Xoá bản nháp
          </Button>
        )}
      </div>
    </div>
  );
}
