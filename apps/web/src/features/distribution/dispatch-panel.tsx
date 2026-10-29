'use client';

import type { OrganizationLabel, ProductState, RetailerOption } from '@dpp/shared';
import { Truck, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/field';
import { StepList } from '@/components/ui/step-list';
import { describeWalletError } from '@/lib/wallet/wallet-errors';
import { FormAlert } from '../auth/form-alert';
import { custodyStepLabels } from './custody-steps';
import {
  CUSTODY_STEPS,
  type CustodyStep,
  cancelDispatch,
  dispatchProduct,
  type PassportTarget,
} from './distribution-flows';

/**
 * DST-01 phía nhà sản xuất: chọn nhà bán lẻ đã duyệt rồi gửi hàng; khi bên kia chưa nhận thì huỷ
 * được (gửi nhầm). Mỗi thao tác là một giao dịch do ví cá nhân của người đại diện ký.
 */
export function DispatchPanel({
  target,
  state,
  pendingRetailer,
  retailers,
}: {
  target: PassportTarget;
  state: ProductState;
  pendingRetailer: OrganizationLabel | null;
  retailers: readonly RetailerOption[];
}) {
  const router = useRouter();
  const [retailerPartyId, setRetailerPartyId] = useState(retailers[0]?.partyId ?? '');
  const [step, setStep] = useState<CustodyStep | null>(null);
  const [method, setMethod] = useState('dispatchCustody');
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = retailers.find((retailer) => retailer.partyId === retailerPartyId);

  async function run(name: string, action: () => Promise<string>) {
    setError(null);
    setMethod(name);
    try {
      await action();
      router.refresh();
    } catch (failure) {
      setError(describeWalletError(failure));
    } finally {
      setStep(null);
      setConfirmingCancel(false);
    }
  }

  const progress = step ? (
    <StepList
      label="Tiến trình giao dịch"
      steps={CUSTODY_STEPS}
      current={step}
      labels={custodyStepLabels(method)}
    />
  ) : null;

  if (state === 'IN_DISTRIBUTION') {
    return (
      <div className="grid gap-4">
        <p className="text-[15px]">
          Đang gửi tới <span className="font-medium">{pendingRetailer?.name ?? 'nhà bán lẻ'}</span>.
          Hàng vẫn thuộc doanh nghiệp của bạn cho tới khi nhà bán lẻ xác nhận đã nhận.
        </p>
        {progress}
        <FormAlert message={error} />
        <div className="flex flex-wrap gap-2">
          {confirmingCancel ? (
            <>
              <Button
                variant="danger"
                disabled={step !== null}
                onClick={() => void run('cancelDispatch', () => cancelDispatch(target, setStep))}
              >
                Xác nhận huỷ gửi
              </Button>
              <Button
                variant="ghost"
                disabled={step !== null}
                onClick={() => setConfirmingCancel(false)}
              >
                Không huỷ
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              disabled={step !== null}
              onClick={() => setConfirmingCancel(true)}
            >
              <Undo2 aria-hidden className="size-4" />
              Huỷ gửi (gửi nhầm)
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (retailers.length === 0) {
    return (
      <p className="text-sm text-muted">
        Chưa có nhà bán lẻ nào được Admin duyệt. Khi có, bạn chọn nhà bán lẻ ở đây để gửi hàng.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <Field
        label="Gửi tới nhà bán lẻ"
        help={
          chosen
            ? `MST ${chosen.taxCode}${chosen.address ? ` · ${chosen.address}` : ''}`
            : undefined
        }
      >
        {(props) => (
          <Select
            {...props}
            value={retailerPartyId}
            disabled={step !== null}
            onChange={(event) => setRetailerPartyId(event.target.value)}
          >
            {retailers.map((retailer) => (
              <option key={retailer.partyId} value={retailer.partyId}>
                {retailer.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {progress}
      <FormAlert message={error} />
      <Button
        className="justify-self-start"
        disabled={step !== null || !chosen}
        onClick={() =>
          void run('dispatchCustody', () => dispatchProduct(target, retailerPartyId, setStep))
        }
      >
        <Truck aria-hidden className="size-4" />
        Gửi hàng
      </Button>
    </div>
  );
}
