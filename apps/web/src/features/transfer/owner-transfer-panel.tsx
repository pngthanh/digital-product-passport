'use client';

import {
  type OwnedProductTransfer,
  TRANSFER_DEFAULT_DAYS,
  TRANSFER_MAX_DAYS,
  TRANSFER_MIN_DAYS,
  type TransferRecipientPreview,
} from '@dpp/shared';
import { ArrowRightLeft, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { StepList } from '@/components/ui/step-list';
import { ApiError } from '@/lib/api-client';
import { describeWalletError } from '@/lib/wallet/wallet-errors';
import { FormAlert } from '../auth/form-alert';
import { TransferActions } from './transfer-actions';
import {
  createTransfer,
  previewRecipient,
  TRANSFER_STEPS,
  type TransferStep,
} from './transfer-flows';
import { TransferPartyName } from './transfer-party';
import { TransferStateBadge, TransferSummary } from './transfer-summary';

const STEP_LABELS: Record<TransferStep, string> = {
  prepare: 'Hệ thống kiểm tra bên nhận và cấp giấy phép',
  send: 'Ví của bạn gửi createTransferRequest, tự trả gas',
  confirm: 'Chờ block finalized và hệ thống ghi nhận',
};

const DAY_OPTIONS = Array.from(
  { length: TRANSFER_MAX_DAYS - TRANSFER_MIN_DAYS + 1 },
  (_, index) => TRANSFER_MIN_DAYS + index,
);

/**
 * TRF-01: chủ sở hữu nhập email hoặc mã số thuế bên nhận, kiểm tra đúng người rồi chọn số ngày
 * chờ; ví của chủ gửi yêu cầu lên OwnershipTransfer. Quyền chỉ chuyển khi bên nhận chấp nhận.
 */
function CreateTransferForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [recipient, setRecipient] = useState('');
  const [days, setDays] = useState(TRANSFER_DEFAULT_DAYS);
  const [preview, setPreview] = useState<TransferRecipientPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [step, setStep] = useState<TransferStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recipientError, setRecipientError] = useState<string | undefined>();

  async function check() {
    setError(null);
    setRecipientError(undefined);
    setPreview(null);
    if (!recipient.trim()) {
      setRecipientError('Nhập email hoặc mã số thuế của bên nhận');
      return;
    }
    setChecking(true);
    try {
      setPreview(await previewRecipient(productId, recipient.trim()));
    } catch (failure) {
      if (failure instanceof ApiError && failure.fieldErrors.recipient) {
        setRecipientError(failure.fieldErrors.recipient);
      } else {
        setRecipientError(describeWalletError(failure));
      }
    } finally {
      setChecking(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview) {
      await check();
      return;
    }
    setError(null);
    try {
      await createTransfer(productId, { recipient: recipient.trim(), days }, setStep);
      router.refresh();
    } catch (failure) {
      setError(describeWalletError(failure));
    } finally {
      setStep(null);
    }
  }

  const busy = checking || step !== null;

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <Field
          label="Bên nhận"
          help="Email tài khoản cá nhân, hoặc mã số thuế của doanh nghiệp đã được duyệt. Bấm Kiểm tra để xem đúng tên bên nhận rồi mới gửi."
          error={recipientError}
        >
          {(props) => (
            <Input
              {...props}
              value={recipient}
              autoComplete="off"
              maxLength={320}
              onChange={(event) => {
                setRecipient(event.target.value);
                setPreview(null);
              }}
              placeholder="ban@example.com hoặc 0312345678"
            />
          )}
        </Field>
        <Button
          type="button"
          variant="secondary"
          className="sm:mt-6.5"
          disabled={busy}
          onClick={() => void check()}
        >
          <Search aria-hidden className="size-4" />
          {checking ? 'Đang tra…' : 'Kiểm tra'}
        </Button>
      </div>

      {preview ? (
        <div className="grid gap-1 rounded-control border border-line bg-canvas px-4 py-3 text-sm">
          <p>
            Chuyển cho <TransferPartyName party={preview.party} />
          </p>
          {preview.needsWallet ? (
            <p className="text-warn">
              Người này chưa liên kết ví MetaMask. Họ cần liên kết ví ở trang Tài khoản trước khi
              chấp nhận.
            </p>
          ) : null}
        </div>
      ) : null}

      <Field
        label="Thời gian chờ bên nhận"
        help="Quá hạn mà bên nhận chưa chấp nhận thì yêu cầu hết hiệu lực, sản phẩm vẫn là của bạn."
      >
        {(props) => (
          <Select
            {...props}
            value={days}
            className="sm:max-w-48"
            onChange={(event) => setDays(Number(event.target.value))}
          >
            {DAY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} ngày
              </option>
            ))}
          </Select>
        )}
      </Field>

      {step ? (
        <StepList
          label="Tiến trình gửi yêu cầu"
          steps={TRANSFER_STEPS}
          current={step}
          labels={STEP_LABELS}
        />
      ) : null}
      <FormAlert message={error} />
      <Button type="submit" className="justify-self-start" disabled={busy || !preview}>
        <ArrowRightLeft aria-hidden className="size-4" />
        Gửi yêu cầu chuyển nhượng
      </Button>
    </form>
  );
}

/**
 * Phần chuyển nhượng trên trang sản phẩm đã mua: yêu cầu đang chờ (huỷ được), form gửi yêu cầu mới
 * hoặc lý do chưa gửi được, và các yêu cầu đã đóng mà người xem là bên gửi.
 */
export function OwnerTransferPanel({
  productId,
  transfer,
  chainId,
}: {
  productId: string;
  transfer: OwnedProductTransfer;
  chainId: number;
}) {
  const active = transfer.active;
  const pendingActive = active?.state === 'REQUESTED' && !active.expired;

  return (
    <div className="grid gap-5">
      {active ? (
        <div className="grid gap-3 rounded-control border border-line p-4">
          <div className="flex flex-wrap items-center gap-2">
            <TransferStateBadge request={active} />
            <span className="text-sm font-medium">Yêu cầu #{active.requestId}</span>
          </div>
          <TransferSummary request={active} chainId={chainId} />
          {active.expired ? (
            <p className="text-sm text-muted">
              Bên nhận không chấp nhận trong hạn. Đóng yêu cầu này, hoặc gửi yêu cầu mới (yêu cầu cũ
              tự đóng).
            </p>
          ) : null}
          <TransferActions request={active} contract={transfer.contract} wallet={transfer.wallet} />
        </div>
      ) : null}

      {transfer.blockedReason === null ? (
        <CreateTransferForm productId={productId} />
      ) : pendingActive ? null : (
        <p className="text-sm text-muted">{transfer.blockedReason}</p>
      )}

      {transfer.history.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-sm font-medium">Yêu cầu đã đóng</h3>
          <ol className="grid gap-3">
            {transfer.history.map((request) => (
              <li key={request.id} className="grid gap-2 rounded-control border border-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <TransferStateBadge request={request} />
                  <span className="text-sm font-medium">Yêu cầu #{request.requestId}</span>
                </div>
                <TransferSummary request={request} chainId={chainId} />
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
