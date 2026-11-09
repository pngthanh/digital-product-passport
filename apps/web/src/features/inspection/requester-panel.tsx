'use client';

import {
  INSPECTION_NOTE_MAX_LENGTH,
  type InspectionRequestView,
  type ProductInspection,
} from '@dpp/shared';
import { Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Select, Textarea } from '@/components/ui/field';
import { ApiError } from '@/lib/api-client';
import { BROWSER_API_BASE } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { INSPECTION_REQUEST_STATE_LABELS } from '@/lib/state-labels';
import { describeWalletError } from '@/lib/wallet/wallet-errors';
import { FormAlert } from '../auth/form-alert';
import {
  cancelInspectionRequest,
  type RequesterScope,
  requestInspection,
} from './inspection-flows';
import { InspectionReport } from './inspection-report';

function RequestItem({
  request,
  chainId,
  pending,
  onCancel,
}: {
  request: InspectionRequestView;
  chainId: number;
  pending: boolean;
  onCancel: (id: string) => void;
}) {
  const state = INSPECTION_REQUEST_STATE_LABELS[request.state];
  return (
    <li className="grid gap-2 rounded-control border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={state.tone} dot>
            {state.label}
          </Badge>
          <span className="text-sm font-medium">{request.inspector.name}</span>
        </div>
        <span className="text-xs text-muted tabular-nums">
          Gửi ngày {formatDate(request.requestedAt)}
        </span>
      </div>
      <p className="text-sm whitespace-pre-line">{request.note}</p>
      {request.declineReason ? (
        <p className="text-sm text-bad">Lý do từ chối: {request.declineReason}</p>
      ) : null}
      {request.report ? (
        <InspectionReport
          report={{ ...request.report, confirmed: request.report.syncStatus === 'CONFIRMED' }}
          fileHref={`${BROWSER_API_BASE}/public/inspections/${request.id}/report`}
          chainId={chainId}
        />
      ) : null}
      {request.state === 'REQUESTED' ? (
        <Button
          size="sm"
          variant="secondary"
          className="justify-self-start"
          disabled={pending}
          onClick={() => onCancel(request.id)}
        >
          Huỷ yêu cầu
        </Button>
      ) : null}
    </li>
  );
}

/**
 * INS-02, INS-03 phía người gửi (nhà sản xuất hoặc chủ sở hữu): chọn đơn vị kiểm định, ghi nội dung
 * cần kiểm định rồi gửi (không cần ví); huỷ khi chưa có kết quả; xem kết quả đã ghi on-chain.
 */
export function InspectionRequesterPanel({
  scope,
  productId,
  inspection,
  chainId,
}: {
  scope: RequesterScope;
  productId: string;
  inspection: ProductInspection;
  chainId: number;
}) {
  const router = useRouter();
  const [inspectorId, setInspectorId] = useState(inspection.inspectors[0]?.organizationId ?? '');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    if (!note.trim()) {
      setFieldErrors({ note: 'Ghi nội dung cần kiểm định' });
      return;
    }
    setPending(true);
    try {
      await requestInspection(scope, productId, inspectorId, note);
      setNote('');
      router.refresh();
    } catch (failure) {
      if (failure instanceof ApiError) {
        setFieldErrors(failure.fieldErrors);
      }
      setError(describeWalletError(failure));
    } finally {
      setPending(false);
    }
  }

  async function cancel(requestId: string) {
    setError(null);
    setPending(true);
    try {
      await cancelInspectionRequest(requestId);
      router.refresh();
    } catch (failure) {
      setError(describeWalletError(failure));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-5">
      {inspection.blockedReason === null ? (
        <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-3">
          <Field label="Đơn vị kiểm định" error={fieldErrors.inspectorOrgId}>
            {(props) => (
              <Select
                {...props}
                value={inspectorId}
                onChange={(event) => setInspectorId(event.target.value)}
              >
                {inspection.inspectors.map((inspector) => (
                  <option key={inspector.organizationId} value={inspector.organizationId}>
                    {inspector.address
                      ? `${inspector.name} · ${inspector.address}`
                      : inspector.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Nội dung cần kiểm định"
            help="Không cần ví MetaMask. Đơn vị kiểm định ghi kết quả và hash biên bản lên blockchain; kết quả hiện công khai trên hộ chiếu."
            error={fieldErrors.note}
          >
            {(props) => (
              <Textarea
                {...props}
                value={note}
                maxLength={INSPECTION_NOTE_MAX_LENGTH}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Ví dụ: kiểm tra an toàn điện và hiệu suất năng lượng"
              />
            )}
          </Field>
          <FormAlert message={error} />
          <Button type="submit" className="justify-self-start" disabled={pending}>
            <Send aria-hidden className="size-4" />
            {pending ? 'Đang gửi…' : 'Gửi yêu cầu kiểm định'}
          </Button>
        </form>
      ) : (
        <>
          <p className="text-sm text-muted">{inspection.blockedReason}</p>
          <FormAlert message={error} />
        </>
      )}

      {inspection.requests.length > 0 ? (
        <ol className="grid gap-3">
          {inspection.requests.map((request) => (
            <RequestItem
              key={request.id}
              request={request}
              chainId={chainId}
              pending={pending}
              onCancel={(id) => void cancel(id)}
            />
          ))}
        </ol>
      ) : null}
    </div>
  );
}
