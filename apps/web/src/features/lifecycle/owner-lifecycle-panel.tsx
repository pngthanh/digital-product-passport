'use client';

import type { OwnedProductLifecycle, OwnerLifecycleMethod } from '@dpp/shared';
import { AlertTriangle, PackageX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { StepList } from '@/components/ui/step-list';
import { describeWalletError } from '@/lib/wallet/wallet-errors';
import { FormAlert } from '../auth/form-alert';
import { LIFECYCLE_STEPS, type LifecycleStep, ownerLifecycleAction } from './lifecycle-flows';

const ACTIONS: Record<OwnerLifecycleMethod, { label: string; title: string; detail: string }> = {
  reportLostStolen: {
    label: 'Báo mất hoặc bị trộm',
    title: 'Báo sản phẩm bị mất hoặc bị trộm',
    detail:
      'Hộ chiếu công khai sẽ cảnh báo để người khác không mua lại. Không hoàn tác được: kể cả khi tìm lại, sản phẩm vẫn ở trạng thái báo mất.',
  },
  retireProduct: {
    label: 'Ngừng sử dụng',
    title: 'Ngừng sử dụng sản phẩm',
    detail:
      'Dùng khi đã thanh lý, tiêu huỷ hoặc không dùng nữa. Không hoàn tác được: sản phẩm không chuyển nhượng, gửi bảo hành hay kiểm định được nữa.',
  },
};

/** LIF-01, LIF-02: chủ sở hữu báo mất hoặc ngừng sử dụng bằng ví của mình (trạng thái cuối). */
export function OwnerLifecyclePanel({
  productId,
  lifecycle,
}: {
  productId: string;
  lifecycle: OwnedProductLifecycle;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<OwnerLifecycleMethod | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [step, setStep] = useState<LifecycleStep | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (lifecycle.blockedReason) {
    return <p className="text-sm text-muted">{lifecycle.blockedReason}</p>;
  }

  async function run(method: OwnerLifecycleMethod) {
    setError(null);
    try {
      await ownerLifecycleAction(productId, lifecycle, method, setStep);
      router.refresh();
    } catch (failure) {
      setError(describeWalletError(failure));
    } finally {
      setStep(null);
    }
  }

  if (!chosen) {
    return (
      <div className="flex flex-wrap gap-2">
        {lifecycle.methods.map((method) => (
          <Button
            key={method}
            variant="secondary"
            onClick={() => {
              setChosen(method);
              setConfirmed(false);
            }}
          >
            {method === 'reportLostStolen' ? (
              <AlertTriangle aria-hidden className="size-4" />
            ) : (
              <PackageX aria-hidden className="size-4" />
            )}
            {ACTIONS[method].label}
          </Button>
        ))}
      </div>
    );
  }

  const action = ACTIONS[chosen];
  return (
    <div className="grid gap-4 rounded-control border border-line-strong px-4 py-4">
      <div>
        <h3 className="font-medium">{action.title}</h3>
        <p className="mt-1 text-sm text-muted">{action.detail}</p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        Tôi hiểu thao tác này không hoàn tác được.
      </label>
      {step ? (
        <StepList
          label="Tiến trình"
          steps={LIFECYCLE_STEPS.filter((item) => item !== 'prepare')}
          current={step}
          labels={{
            prepare: '',
            send: `Ví của bạn gửi ${chosen}, tự trả gas`,
            confirm: 'Chờ block finalized và hệ thống ghi nhận',
          }}
        />
      ) : null}
      <FormAlert message={error} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="danger"
          disabled={!confirmed || step !== null}
          onClick={() => void run(chosen)}
        >
          {step ? 'Đang gửi…' : `Ký và ${action.label.toLowerCase()}`}
        </Button>
        <Button variant="ghost" disabled={step !== null} onClick={() => setChosen(null)}>
          Huỷ
        </Button>
      </div>
    </div>
  );
}
