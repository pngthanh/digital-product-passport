'use client';

import type { ContractInfo, TransferRequestView } from '@dpp/shared';
import { Check, Clock, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { StepList } from '@/components/ui/step-list';
import { describeWalletError } from '@/lib/wallet/wallet-errors';
import { FormAlert } from '../auth/form-alert';
import {
  closeTransfer,
  type TransferAction,
  type TransferStep,
  transferActionsFor,
} from './transfer-flows';

const CLOSE_STEPS = ['send', 'confirm'] as const satisfies readonly TransferStep[];
type CloseStep = (typeof CLOSE_STEPS)[number];

const STEP_LABELS: Record<TransferAction, Record<CloseStep, string>> = {
  acceptTransfer: {
    send: 'Ví của bạn gửi acceptTransfer, tự trả gas',
    confirm: 'Chờ block finalized, quyền sở hữu chuyển sang bạn',
  },
  rejectTransfer: {
    send: 'Ví của bạn gửi rejectTransfer, tự trả gas',
    confirm: 'Chờ block finalized và hệ thống ghi nhận',
  },
  cancelTransfer: {
    send: 'Ví của bạn gửi cancelTransfer, tự trả gas',
    confirm: 'Chờ block finalized và hệ thống ghi nhận',
  },
  expireTransfer: {
    send: 'Ví của bạn gửi expireTransfer, tự trả gas',
    confirm: 'Chờ block finalized và hệ thống ghi nhận',
  },
};

/**
 * TRF-02..05: bên nhận chấp nhận hoặc từ chối, bên gửi huỷ, ai trong cuộc cũng đóng được yêu cầu đã
 * quá hạn. Mỗi nút là một giao dịch từ ví đã liên kết của người xem, không cần giấy phép.
 */
export function TransferActions({
  request,
  contract,
  wallet,
  onDone,
}: {
  request: TransferRequestView;
  contract: ContractInfo | null;
  wallet: string | null;
  /** Gọi sau khi giao dịch được ghi nhận; mặc định tải lại trang. */
  onDone?: (action: TransferAction) => void;
}) {
  const router = useRouter();
  const [running, setRunning] = useState<TransferAction | null>(null);
  const [step, setStep] = useState<CloseStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actions = transferActionsFor(request);
  const unavailableNote =
    request.state === 'REQUESTED' && request.productUnavailable ? (
      <p className="text-sm text-warn">
        Sản phẩm đã bị thu hồi, báo mất hoặc ngừng sử dụng nên yêu cầu này không chấp nhận được nữa.
        {request.direction === 'OUTGOING' ? ' Huỷ yêu cầu để đóng lại.' : ''}
      </p>
    ) : null;

  if (actions.length === 0 || !contract) {
    return unavailableNote;
  }
  if (!wallet) {
    return (
      <p className="text-sm text-warn">
        Liên kết ví MetaMask ở trang Tài khoản trước: ví của bạn ký giao dịch{' '}
        {request.direction === 'INCOMING' ? 'chấp nhận hoặc từ chối' : 'huỷ yêu cầu'}.
      </p>
    );
  }

  async function run(action: TransferAction) {
    if (!contract || !wallet) {
      return;
    }
    setError(null);
    setRunning(action);
    try {
      await closeTransfer(contract, wallet, action, request.requestId, (next) => {
        if (next !== 'prepare') {
          setStep(next);
        }
      });
      if (onDone) {
        onDone(action);
      } else {
        router.refresh();
      }
    } catch (failure) {
      setError(describeWalletError(failure));
    } finally {
      setRunning(null);
      setStep(null);
    }
  }

  return (
    <div className="grid gap-3">
      {unavailableNote}
      {running && step ? (
        <StepList
          label="Tiến trình giao dịch"
          steps={CLOSE_STEPS}
          current={step}
          labels={STEP_LABELS[running]}
        />
      ) : null}
      <FormAlert message={error} />
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action}
            size="sm"
            variant={action === 'acceptTransfer' ? 'primary' : 'secondary'}
            disabled={running !== null}
            onClick={() => void run(action)}
          >
            {action === 'acceptTransfer' ? (
              <Check aria-hidden className="size-4" />
            ) : action === 'expireTransfer' ? (
              <Clock aria-hidden className="size-4" />
            ) : (
              <X aria-hidden className="size-4" />
            )}
            {ACTION_LABELS[action]}
          </Button>
        ))}
      </div>
    </div>
  );
}

const ACTION_LABELS: Record<TransferAction, string> = {
  acceptTransfer: 'Chấp nhận',
  rejectTransfer: 'Từ chối',
  cancelTransfer: 'Huỷ yêu cầu',
  expireTransfer: 'Đóng yêu cầu hết hạn',
};
