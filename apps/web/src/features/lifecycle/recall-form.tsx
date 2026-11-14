'use client';

import {
  type ProductSummary,
  RECALL_MAX_BATCH_SIZE,
  RECALL_REASON_MAX_LENGTH,
  RECALL_REASON_MIN_LENGTH,
} from '@dpp/shared';
import { Ban } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { StepList } from '@/components/ui/step-list';
import { describeWalletError } from '@/lib/wallet/wallet-errors';
import { FormAlert } from '../auth/form-alert';
import { LIFECYCLE_STEPS, type LifecycleStep, recallProducts } from './lifecycle-flows';

const STEP_LABELS: Record<LifecycleStep, string> = {
  prepare: 'Hệ thống lưu lý do và cấp giấy phép thu hồi',
  send: 'Ví của bạn gửi recallProducts, tự trả gas',
  confirm: 'Chờ block finalized và hệ thống ghi nhận',
};

/**
 * RCL-01: nhà sản xuất thu hồi các sản phẩm đã chọn, chung một lý do. Lý do hiện công khai trên hộ
 * chiếu; chủ sở hữu và nhà bán lẻ đang giữ hàng được thông báo.
 */
export function RecallForm({
  products,
  onCancel,
  onDone,
}: {
  products: readonly ProductSummary[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [step, setStep] = useState<LifecycleStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | undefined>();
  const tooMany = products.length > RECALL_MAX_BATCH_SIZE;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const text = reason.trim();
    if (text.length < RECALL_REASON_MIN_LENGTH) {
      setReasonError(`Lý do thu hồi tối thiểu ${RECALL_REASON_MIN_LENGTH} ký tự`);
      return;
    }
    setReasonError(undefined);
    try {
      await recallProducts(
        products.map((product) => product.id),
        text,
        setStep,
      );
      onDone();
    } catch (failure) {
      setError(describeWalletError(failure));
    } finally {
      setStep(null);
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="grid gap-4 rounded-panel border border-bad/40 bg-surface px-5 py-4"
      aria-label="Thu hồi sản phẩm"
    >
      <div>
        <h2 className="font-semibold">Thu hồi {products.length} sản phẩm</h2>
        <p className="mt-1 text-sm text-muted">
          Thu hồi là trạng thái cuối, không hoàn tác. Sản phẩm không bán, giao, chuyển nhượng, gửi
          bảo hành hay kiểm định được nữa; hàng đang giao tự huỷ bàn giao. Lý do hiện công khai trên
          hộ chiếu; chủ sở hữu và nhà bán lẻ đang giữ hàng được thông báo.
        </p>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {products.map((product) => (
          <li
            key={product.id}
            className="rounded-full border border-line px-2.5 py-0.5 font-mono text-[13px]"
          >
            {product.serialNumber}
          </li>
        ))}
      </ul>
      {tooMany ? (
        <p className="rounded-control bg-warn-tint px-3 py-2 text-sm text-warn">
          Mỗi lần thu hồi tối đa {RECALL_MAX_BATCH_SIZE} sản phẩm. Bỏ chọn bớt rồi làm nhiều lần.
        </p>
      ) : null}
      <Field
        label="Lý do thu hồi"
        help={`Ghi rõ lỗi và việc người dùng cần làm (${RECALL_REASON_MIN_LENGTH} đến ${RECALL_REASON_MAX_LENGTH} ký tự). Hash của lý do được ghi lên blockchain.`}
        error={reasonError}
      >
        {(control) => (
          <Textarea
            {...control}
            rows={4}
            value={reason}
            maxLength={RECALL_REASON_MAX_LENGTH}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ví dụ: Bộ sạc có thể quá nhiệt khi dùng liên tục. Ngừng sử dụng và mang tới cửa hàng để được đổi."
          />
        )}
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        Tôi hiểu thu hồi không hoàn tác được.
      </label>
      {step ? (
        <StepList
          label="Tiến trình thu hồi"
          steps={LIFECYCLE_STEPS}
          current={step}
          labels={STEP_LABELS}
        />
      ) : null}
      <FormAlert message={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" disabled={!confirmed || tooMany || step !== null}>
          <Ban aria-hidden className="size-4" />
          {step ? 'Đang thu hồi…' : `Ký và thu hồi ${products.length} sản phẩm`}
        </Button>
        <Button type="button" variant="ghost" disabled={step !== null} onClick={onCancel}>
          Huỷ
        </Button>
      </div>
    </form>
  );
}
