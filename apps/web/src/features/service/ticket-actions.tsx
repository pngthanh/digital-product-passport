'use client';

import {
  SERVICE_ACTION_CODES,
  SERVICE_ACTION_DETAIL_MAX_LENGTH,
  type ServiceActionCode,
} from '@dpp/shared';
import { ClipboardCheck, Wrench } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { StepList } from '@/components/ui/step-list';
import { cn } from '@/lib/cn';
import { EVIDENCE_ACCEPT, evidenceFileError } from '@/lib/evidence-file';
import { SERVICE_ACTION_LABELS } from '@/lib/state-labels';
import { describeWalletError } from '@/lib/wallet/wallet-errors';
import { FormAlert } from '../auth/form-alert';
import {
  closeServiceTicket,
  openServiceTicket,
  TICKET_STEPS,
  type TicketStep,
} from './service-flows';

function stepLabels(method: 'openTicket' | 'closeTicket'): Record<TicketStep, string> {
  return {
    prepare:
      method === 'openTicket'
        ? 'Hệ thống kiểm tra yêu cầu và cấp giấy phép mở phiếu'
        : 'Lưu biên bản và file, tính hash biên bản',
    send: `Ví cá nhân gửi ${method}, tự trả gas`,
    confirm: 'Chờ block finalized và hệ thống ghi nhận',
  };
}

/** SVC-03: tiếp nhận yêu cầu và mở phiếu trên blockchain bằng ví của người đại diện trung tâm. */
export function OpenTicketAction({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [step, setStep] = useState<TicketStep | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setError(null);
    try {
      await openServiceTicket(requestId, setStep);
      router.refresh();
    } catch (failure) {
      setError(describeWalletError(failure));
    } finally {
      setStep(null);
    }
  }

  return (
    <div className="grid gap-3">
      {step ? (
        <StepList
          label="Tiến trình mở phiếu"
          steps={TICKET_STEPS}
          current={step}
          labels={stepLabels('openTicket')}
        />
      ) : null}
      <FormAlert message={error} />
      <Button className="justify-self-start" disabled={step !== null} onClick={() => void open()}>
        <Wrench aria-hidden className="size-4" />
        Tiếp nhận và mở phiếu
      </Button>
    </div>
  );
}

/**
 * SVC-04: chọn kết quả, việc đã làm, ghi chú và (không bắt buộc) ảnh hoặc PDF biên bản; hệ thống lưu
 * biên bản và trả hash, ví trung tâm gửi closeTicket với hash đó.
 */
export function TicketResultForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [repaired, setRepaired] = useState(true);
  const [actionCode, setActionCode] = useState<ServiceActionCode>('REPAIR');
  const [detail, setDetail] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<TicketStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileError = evidenceFileError(file);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await closeServiceTicket(
        requestId,
        { repaired, actionCode, actionDetail: detail, file },
        setStep,
      );
      router.refresh();
    } catch (failure) {
      setError(describeWalletError(failure));
    } finally {
      setStep(null);
    }
  }

  const busy = step !== null;
  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-4">
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Kết quả</legend>
        <div className="flex flex-wrap gap-2">
          {[
            { value: true, label: 'Đã sửa xong' },
            { value: false, label: 'Không sửa được' },
          ].map((option) => (
            <label
              key={option.label}
              className={cn(
                'flex h-9 cursor-pointer items-center gap-2 rounded-control border px-3 text-sm',
                repaired === option.value
                  ? 'border-primary bg-tint font-medium text-tint-ink'
                  : 'border-line-strong text-muted hover:bg-tint',
              )}
            >
              <input
                type="radio"
                name="repaired"
                className="sr-only"
                checked={repaired === option.value}
                onChange={() => setRepaired(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Việc đã làm">
        {(props) => (
          <Select
            {...props}
            value={actionCode}
            onChange={(event) =>
              setActionCode(
                SERVICE_ACTION_CODES.find((code) => code === event.target.value) ?? 'OTHER',
              )
            }
          >
            {SERVICE_ACTION_CODES.map((code) => (
              <option key={code} value={code}>
                {SERVICE_ACTION_LABELS[code]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        label="Ghi chú kỹ thuật"
        help="Linh kiện đã thay, nguyên nhân lỗi, thời gian chạy thử…"
      >
        {(props) => (
          <Textarea
            {...props}
            value={detail}
            maxLength={SERVICE_ACTION_DETAIL_MAX_LENGTH}
            onChange={(event) => setDetail(event.target.value)}
          />
        )}
      </Field>
      <Field
        label="Ảnh hoặc PDF biên bản (không bắt buộc)"
        help="JPEG, PNG, WebP hoặc PDF, tối đa 5 MB. File lưu trên máy chủ; hash của file nằm trong hash biên bản ghi on-chain."
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
          label="Tiến trình đóng phiếu"
          steps={TICKET_STEPS}
          current={step}
          labels={stepLabels('closeTicket')}
        />
      ) : null}
      <FormAlert message={error} />
      <Button type="submit" className="justify-self-start" disabled={busy || fileError !== null}>
        <ClipboardCheck aria-hidden className="size-4" />
        Ghi biên bản và đóng phiếu
      </Button>
    </form>
  );
}
