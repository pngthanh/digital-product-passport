'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { StepList } from '@/components/ui/step-list';
import { describeWalletError } from '@/lib/wallet/wallet-errors';
import { FormAlert } from '../auth/form-alert';
import {
  REGISTER_STEPS,
  type RegisteredProduct,
  type RegisterStep,
  registerStepLabels,
  retryProducts,
} from './product-flows';

/**
 * Hồ sơ đã lưu nhưng ví chưa ghi lên blockchain (từ chối ký, hết MON...): gửi lại đúng các bản nháp
 * đó với giấy phép mới, mã QR giữ nguyên, thay vì nhập lại (sẽ trùng serial).
 */
export function SavedDraftsRetry({
  drafts,
  chainId,
  onRegistered,
}: {
  drafts: readonly RegisteredProduct[];
  chainId: number;
  onRegistered: (products: RegisteredProduct[]) => void;
}) {
  const [step, setStep] = useState<RegisterStep | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setError(null);
    try {
      onRegistered(
        await retryProducts(
          drafts.map((draft) => draft.id),
          chainId,
          setStep,
        ),
      );
    } catch (failure) {
      setError(describeWalletError(failure));
    } finally {
      setStep(null);
    }
  }

  return (
    <div className="grid gap-3 rounded-control border border-line px-4 py-3.5">
      <p className="text-sm">
        Hồ sơ {drafts.length === 1 ? '' : `${drafts.length} sản phẩm `}đã lưu thành bản nháp, mã QR
        giữ nguyên. Kiểm tra MetaMask rồi ghi lại, hoặc để sau ở{' '}
        <Link
          href={{ pathname: '/products', query: { filter: 'DRAFT' } }}
          className="font-medium text-tint-ink underline-offset-4 hover:underline"
        >
          danh sách bản nháp
        </Link>
        .
      </p>
      {step ? (
        <StepList
          label="Tiến trình ghi lại bản nháp"
          steps={REGISTER_STEPS}
          current={step}
          labels={registerStepLabels(drafts.length)}
        />
      ) : null}
      <FormAlert message={error} />
      <Button className="justify-self-start" disabled={step !== null} onClick={() => void retry()}>
        {step ? 'Đang xử lý…' : 'Thử ghi lại lên blockchain'}
      </Button>
    </div>
  );
}
