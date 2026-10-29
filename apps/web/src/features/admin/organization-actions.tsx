'use client';

import type { AdminDecision, OrganizationSummary } from '@dpp/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { describeWalletError } from '@/lib/wallet/wallet-errors';
import { FormAlert } from '../auth/form-alert';
import { reasonSchema } from '../organization/organization.schema';
import { type AdminContext, approveOrganization, decideOrganization } from './admin-flows';

type Mode =
  | { kind: 'idle' }
  | { kind: 'reason'; decision: AdminDecision }
  | { kind: 'running'; label: string };

/** Nút Duyệt, Từ chối (đơn chờ duyệt) và Khoá (doanh nghiệp đã duyệt) của một dòng. */
export function OrganizationActions({
  organization,
  context,
}: {
  organization: OrganizationSummary;
  context: AdminContext;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | undefined>();

  async function run(label: string, action: () => Promise<void>) {
    setError(null);
    setMode({ kind: 'running', label });
    try {
      await action();
      setMode({ kind: 'idle' });
      router.refresh();
    } catch (failure) {
      setError(describeWalletError(failure));
      setMode({ kind: 'idle' });
    }
  }

  function onReason(event: FormEvent<HTMLFormElement>, decision: AdminDecision) {
    event.preventDefault();
    const parsed = reasonSchema.safeParse(new FormData(event.currentTarget).get('reason'));
    if (!parsed.success) {
      setReasonError(parsed.error.issues[0]?.message);
      return;
    }
    setReasonError(undefined);
    void run(decision === 'REJECT' ? 'Đang từ chối…' : 'Đang khoá…', () =>
      decideOrganization(context, organization.id, decision, parsed.data),
    );
  }

  if (mode.kind === 'running') {
    return (
      <p role="status" className="text-sm text-muted">
        {mode.label} Xác nhận giao dịch trong MetaMask rồi chờ block finalized.
      </p>
    );
  }

  if (mode.kind === 'reason') {
    const rejecting = mode.decision === 'REJECT';
    return (
      <form noValidate onSubmit={(event) => onReason(event, mode.decision)} className="grid gap-3">
        <Field
          label={rejecting ? 'Lý do từ chối' : 'Lý do khoá'}
          help="Người đại diện thấy lý do này; contract chỉ lưu hash của nó."
          error={reasonError}
        >
          {(control) => <Textarea {...control} name="reason" rows={2} />}
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant={rejecting ? 'primary' : 'danger'} size="sm">
            {rejecting ? 'Từ chối đơn' : 'Khoá doanh nghiệp'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMode({ kind: 'idle' })}>
            Huỷ
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {organization.stage === 'PENDING' ? (
          <>
            <Button
              size="sm"
              onClick={() => run('Đang duyệt…', () => approveOrganization(context, organization))}
            >
              Duyệt
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setMode({ kind: 'reason', decision: 'REJECT' })}
            >
              Từ chối
            </Button>
          </>
        ) : null}
        {organization.stage === 'AUTHORIZED' ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setMode({ kind: 'reason', decision: 'DISABLE' })}
          >
            Khoá
          </Button>
        ) : null}
      </div>
      <FormAlert message={error} />
    </div>
  );
}
