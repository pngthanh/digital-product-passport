'use client';

import { ALERT_DECISIONS, ALERT_NOTE_MAX_LENGTH, type AlertDecision } from '@dpp/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { ApiError, apiRequest } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { FormAlert } from '../auth/form-alert';
import { DECISION_LABELS } from './monitoring-labels';
import { anomalyAlertSchema, reviewFormSchema } from './monitoring.schema';

/**
 * AUD-04: Admin chốt cảnh báo đang mở là Đã xử lý hoặc Báo nhầm, kèm ghi chú bắt buộc. Ghi chú
 * được lưu vào nhật ký kiểm toán cùng người chốt.
 */
export function AlertReviewForm({ alertId }: { alertId: string }) {
  const router = useRouter();
  const groupId = useId();
  const [decision, setDecision] = useState<AlertDecision | null>(null);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ decision?: string; note?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = reviewFormSchema.safeParse({ decision: decision ?? undefined, note });
    if (!parsed.success) {
      const next: { decision?: string; note?: string } = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if ((key === 'decision' || key === 'note') && !next[key]) {
          next[key] = issue.message;
        }
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setFailure(null);
    setSaving(true);
    try {
      await apiRequest(`/admin/alerts/${alertId}/review`, anomalyAlertSchema, {
        method: 'POST',
        body: parsed.data,
      });
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.note) {
        setErrors({ note: error.fieldErrors.note });
      } else {
        setFailure(error instanceof Error ? error.message : 'Không lưu được. Thử lại.');
      }
      setSaving(false);
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-4">
      <fieldset aria-describedby={errors.decision ? `${groupId}-error` : undefined}>
        <legend className="text-sm font-medium">Kết luận</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {ALERT_DECISIONS.map((item) => (
            <label
              key={item}
              className={cn(
                'flex cursor-pointer gap-3 rounded-control border px-3 py-2.5 transition-colors',
                decision === item ? 'border-primary bg-tint' : 'border-line-strong hover:bg-tint',
              )}
            >
              <input
                type="radio"
                name="decision"
                value={item}
                checked={decision === item}
                onChange={() => setDecision(item)}
                className="mt-1 accent-[var(--primary)]"
              />
              <span>
                <span className="block text-sm font-medium">{DECISION_LABELS[item].label}</span>
                <span className="block text-sm text-muted">{DECISION_LABELS[item].help}</span>
              </span>
            </label>
          ))}
        </div>
        {errors.decision ? (
          <p id={`${groupId}-error`} className="mt-1.5 text-sm text-bad">
            {errors.decision}
          </p>
        ) : null}
      </fieldset>

      <Field
        label="Ghi chú"
        help={`Đã kiểm tra gì, xử lý thế nào. Lưu vào nhật ký kiểm toán. ${note.trim().length}/${ALERT_NOTE_MAX_LENGTH}`}
        error={errors.note}
      >
        {(control) => (
          <Textarea
            {...control}
            name="note"
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </Field>

      <FormAlert message={failure} />

      <div>
        <Button type="submit" disabled={saving}>
          {saving ? 'Đang lưu…' : 'Chốt cảnh báo'}
        </Button>
      </div>
    </form>
  );
}
