'use client';

import { type OwnedProductService, SERVICE_ISSUE_MAX_LENGTH } from '@dpp/shared';
import { Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Select, Textarea } from '@/components/ui/field';
import { ApiError } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { SERVICE_STATE_LABELS } from '@/lib/state-labels';
import { describeWalletError } from '@/lib/wallet/wallet-errors';
import { FormAlert } from '../auth/form-alert';
import { cancelServiceRequest, requestService } from './service-flows';
import { ServiceRecord } from './service-record';

/**
 * SVC-01, SVC-02 phía chủ sở hữu: chọn trung tâm bảo hành, mô tả lỗi rồi gửi (không cần ví); huỷ
 * khi trung tâm chưa tiếp nhận; xem các lần sửa kèm biên bản đã ghi hash on-chain.
 */
export function OwnerServicePanel({
  productId,
  service,
  chainId,
}: {
  productId: string;
  service: OwnedProductService;
  chainId: number;
}) {
  const router = useRouter();
  const [centerId, setCenterId] = useState(service.centers[0]?.organizationId ?? '');
  const [issue, setIssue] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    if (!issue.trim()) {
      setFieldErrors({ issueDesc: 'Mô tả lỗi của sản phẩm' });
      return;
    }
    setPending(true);
    try {
      await requestService(productId, centerId, issue);
      setIssue('');
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
      await cancelServiceRequest(requestId);
      router.refresh();
    } catch (failure) {
      setError(describeWalletError(failure));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-5">
      {service.blockedReason === null ? (
        <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-3">
          <Field label="Trung tâm bảo hành" error={fieldErrors.serviceCenterOrgId}>
            {(props) => (
              <Select
                {...props}
                value={centerId}
                onChange={(event) => setCenterId(event.target.value)}
              >
                {service.centers.map((center) => (
                  <option key={center.organizationId} value={center.organizationId}>
                    {center.address ? `${center.name} · ${center.address}` : center.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Mô tả lỗi"
            help="Không cần ví MetaMask. Khi trung tâm tiếp nhận, phiếu sửa được ghi lên blockchain; còn bảo hành thì bảo hành tạm dừng trong lúc sửa."
            error={fieldErrors.issueDesc}
          >
            {(props) => (
              <Textarea
                {...props}
                value={issue}
                maxLength={SERVICE_ISSUE_MAX_LENGTH}
                onChange={(event) => setIssue(event.target.value)}
                placeholder="Ví dụ: màn hình có sọc ngang, âm thanh vẫn bình thường"
              />
            )}
          </Field>
          <FormAlert message={error} />
          <Button type="submit" className="justify-self-start" disabled={pending}>
            <Send aria-hidden className="size-4" />
            {pending ? 'Đang gửi…' : 'Gửi yêu cầu bảo hành'}
          </Button>
        </form>
      ) : (
        <>
          <p className="text-sm text-muted">{service.blockedReason}</p>
          <FormAlert message={error} />
        </>
      )}

      {service.requests.length > 0 ? (
        <ol className="grid gap-3">
          {service.requests.map((request) => {
            const state = SERVICE_STATE_LABELS[request.state];
            return (
              <li key={request.id} className="grid gap-2 rounded-control border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={state.tone} dot>
                      {state.label}
                    </Badge>
                    <span className="text-sm font-medium">{request.serviceCenter.name}</span>
                  </div>
                  <span className="text-xs text-muted tabular-nums">
                    Gửi ngày {formatDate(request.requestedAt)}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-line">{request.issueDesc}</p>
                <ServiceRecord request={request} chainId={chainId} />
                {request.state === 'REQUESTED' ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="justify-self-start"
                    disabled={pending}
                    onClick={() => void cancel(request.id)}
                  >
                    Huỷ yêu cầu
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
