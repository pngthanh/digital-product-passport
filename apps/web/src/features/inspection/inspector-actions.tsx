'use client';

import {
  INSPECTION_DECLINE_REASON_MAX_LENGTH,
  INSPECTION_SUMMARY_MAX_LENGTH,
  type InspectionResult,
} from '@dpp/shared';
import { ClipboardCheck, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { StepList } from '@/components/ui/step-list';
import { cn } from '@/lib/cn';
import { EVIDENCE_ACCEPT, evidenceFileError } from '@/lib/evidence-file';
import { INSPECTION_RESULT_LABELS } from '@/lib/state-labels';
import { describeWalletError } from '@/lib/wallet/wallet-errors';
import { FormAlert } from '../auth/form-alert';
import {
  declineInspection,
  RECORD_STEPS,
  type RecordStep,
  recordInspection,
} from './inspection-flows';

const RESULTS: readonly InspectionResult[] = ['PASS', 'CONDITIONAL', 'FAIL'];

const STEP_LABELS: Record<RecordStep, string> = {
  prepare: 'Lưu biên bản và file, hệ thống cấp giấy phép khoá kết quả và hash',
  send: 'Ví cá nhân gửi recordInspection, tự trả gas',
  confirm: 'Chờ block finalized và hệ thống ghi nhận',
};

/**
 * INS-01: chọn kết quả, ghi kết luận và (không bắt buộc) ảnh hoặc PDF biên bản; hệ thống lưu biên
 * bản, ví đơn vị kiểm định ghi kết quả cùng hash lên InspectionRegistry.
 */
export function InspectionResultForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [result, setResult] = useState<InspectionResult>('PASS');
  const [summary, setSummary] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<RecordStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | undefined>();
  const fileError = evidenceFileError(file);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSummaryError(undefined);
    if (!summary.trim()) {
      setSummaryError('Ghi tóm tắt kết luận');
      return;
    }
    try {
      await recordInspection(requestId, { result, summary, file }, setStep);
      router.refresh();
    } catch (failure) {
      setError(describeWalletError(failure));
    } finally {
      setStep(null);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-4">
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Kết quả</legend>
        <div className="flex flex-wrap gap-2">
          {RESULTS.map((option) => (
            <label
              key={option}
              className={cn(
                'flex h-9 cursor-pointer items-center gap-2 rounded-control border px-3 text-sm',
                result === option
                  ? 'border-primary bg-tint font-medium text-tint-ink'
                  : 'border-line-strong text-muted hover:bg-tint',
              )}
            >
              <input
                type="radio"
                name="result"
                className="sr-only"
                checked={result === option}
                onChange={() => setResult(option)}
              />
              {INSPECTION_RESULT_LABELS[option].label}
            </label>
          ))}
        </div>
      </fieldset>
      <Field
        label="Kết luận"
        help="Tiêu chuẩn áp dụng, chỉ tiêu đã đo, điều kiện kèm theo (nếu đạt có điều kiện)…"
        error={summaryError}
      >
        {(props) => (
          <Textarea
            {...props}
            value={summary}
            maxLength={INSPECTION_SUMMARY_MAX_LENGTH}
            onChange={(event) => setSummary(event.target.value)}
          />
        )}
      </Field>
      <Field
        label="Ảnh hoặc PDF biên bản (không bắt buộc)"
        help="JPEG, PNG, WebP hoặc PDF, tối đa 5 MB. File công khai trên hộ chiếu; hash của file nằm trong hash biên bản ghi on-chain."
        error={fileError ?? undefined}
      >
        {(props) => (
          <Input
            {...props}
            type="file"
            accept={EVIDENCE_ACCEPT}
            className="h-auto py-2 text-sm"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        )}
      </Field>
      {step ? (
        <StepList
          label="Tiến trình ghi kết quả"
          steps={RECORD_STEPS}
          current={step}
          labels={STEP_LABELS}
        />
      ) : null}
      <FormAlert message={error} />
      <Button
        type="submit"
        className="justify-self-start"
        disabled={step !== null || fileError !== null}
      >
        <ClipboardCheck aria-hidden className="size-4" />
        Ghi kết quả kiểm định
      </Button>
    </form>
  );
}

/** INS-04: từ chối yêu cầu kèm lý do (không cần ví, không lên blockchain). */
export function DeclineInspectionForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | undefined>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setReasonError(undefined);
    if (!reason.trim()) {
      setReasonError('Ghi lý do từ chối');
      return;
    }
    setPending(true);
    try {
      await declineInspection(requestId, reason);
      router.refresh();
    } catch (failure) {
      setError(describeWalletError(failure));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-3">
      <Field label="Lý do từ chối" error={reasonError}>
        {(props) => (
          <Input
            {...props}
            value={reason}
            maxLength={INSPECTION_DECLINE_REASON_MAX_LENGTH}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ví dụ: đơn vị chưa có phòng thử nghiệm cho loại sản phẩm này"
          />
        )}
      </Field>
      <FormAlert message={error} />
      <Button type="submit" variant="secondary" className="justify-self-start" disabled={pending}>
        <X aria-hidden className="size-4" />
        Từ chối yêu cầu
      </Button>
    </form>
  );
}
