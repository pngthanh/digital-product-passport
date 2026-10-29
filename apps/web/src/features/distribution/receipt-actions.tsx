'use client';

import { PackageCheck, PackageX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { StepList } from '@/components/ui/step-list';
import { describeWalletError } from '@/lib/wallet/wallet-errors';
import { FormAlert } from '../auth/form-alert';
import { custodyStepLabels } from './custody-steps';
import {
  CUSTODY_STEPS,
  type CustodyStep,
  confirmReceipt,
  type PassportTarget,
  rejectReceipt,
} from './distribution-flows';

/**
 * DST-02 phía nhà bán lẻ: xác nhận đã nhận hàng (từ đây cửa hàng giữ hàng) hoặc từ chối nếu không
 * đúng hàng (hàng về lại nhà sản xuất). Từ chối cần bấm xác nhận lần hai.
 */
export function ReceiptActions({
  target,
  compact = false,
  leaveAfterReject = false,
}: {
  target: PassportTarget;
  compact?: boolean;
  /** Trang chi tiết: từ chối xong thì về kho vì sản phẩm không còn thuộc cửa hàng. */
  leaveAfterReject?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<CustodyStep | null>(null);
  const [method, setMethod] = useState('confirmCustodyReceipt');
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(name: string, action: () => Promise<string>, leave = false) {
    setError(null);
    setMethod(name);
    try {
      await action();
      if (leave) {
        router.push('/inventory?filter=INCOMING');
      } else {
        router.refresh();
      }
    } catch (failure) {
      setError(describeWalletError(failure));
    } finally {
      setStep(null);
      setConfirmingReject(false);
    }
  }

  const size = compact ? 'sm' : 'md';
  return (
    <div className="grid gap-3">
      {step ? (
        <StepList
          label="Tiến trình giao dịch"
          steps={CUSTODY_STEPS}
          current={step}
          labels={custodyStepLabels(method)}
        />
      ) : null}
      <FormAlert message={error} />
      <div className="flex flex-wrap gap-2">
        {confirmingReject ? (
          <>
            <Button
              size={size}
              variant="danger"
              disabled={step !== null}
              onClick={() =>
                void run(
                  'rejectCustodyReceipt',
                  () => rejectReceipt(target, setStep),
                  leaveAfterReject,
                )
              }
            >
              Xác nhận từ chối
            </Button>
            <Button
              size={size}
              variant="ghost"
              disabled={step !== null}
              onClick={() => setConfirmingReject(false)}
            >
              Không từ chối
            </Button>
          </>
        ) : (
          <>
            <Button
              size={size}
              disabled={step !== null}
              onClick={() =>
                void run('confirmCustodyReceipt', () => confirmReceipt(target, setStep))
              }
            >
              <PackageCheck aria-hidden className="size-4" />
              Đã nhận hàng
            </Button>
            <Button
              size={size}
              variant="secondary"
              disabled={step !== null}
              onClick={() => setConfirmingReject(true)}
            >
              <PackageX aria-hidden className="size-4" />
              Từ chối
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
