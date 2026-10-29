'use client';

import { formatPublicCode, type ProductSummary } from '@dpp/shared';
import { Printer, RotateCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { StepList } from '@/components/ui/step-list';
import { formatDate } from '@/lib/format';
import { describeWalletError } from '@/lib/wallet/wallet-errors';
import { FormAlert } from '../auth/form-alert';
import {
  REGISTER_STEPS,
  type RegisterStep,
  registerStepLabels,
  retryProducts,
} from './product-flows';
import { locationText, productStatusLabel, warrantyLabel } from './product-status';

/**
 * Danh sách sản phẩm của nhà sản xuất. Chọn nhiều dòng để in tem QR (sản phẩm đã lên blockchain)
 * hoặc gửi lại bản nháp trong một giao dịch.
 */
export function ProductTable({
  items,
  chainId,
}: {
  items: readonly ProductSummary[];
  chainId: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [step, setStep] = useState<RegisterStep | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chosen = items.filter((item) => selected.has(item.id));
  const registered = chosen.filter((item) => item.syncStatus === 'CONFIRMED');
  const drafts = chosen.filter((item) => item.syncStatus === 'PENDING');
  const allSelected = items.length > 0 && selected.size === items.length;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function resend() {
    setError(null);
    try {
      await retryProducts(
        drafts.map((draft) => draft.id),
        chainId,
        setStep,
      );
      setSelected(new Set());
      router.refresh();
    } catch (failure) {
      setError(describeWalletError(failure));
    } finally {
      setStep(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--primary)]"
            checked={allSelected}
            onChange={() =>
              setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)))
            }
          />
          Chọn tất cả trên trang
        </label>
        {registered.length > 0 ? (
          <ButtonLink
            href={`/products/labels?ids=${registered.map((item) => item.id).join(',')}`}
            variant="secondary"
            size="sm"
          >
            <Printer aria-hidden className="size-4" />
            In tem QR ({registered.length})
          </ButtonLink>
        ) : null}
        {drafts.length > 0 ? (
          <Button size="sm" disabled={step !== null} onClick={() => void resend()}>
            <RotateCw aria-hidden className="size-4" />
            Ghi {drafts.length} bản nháp lên blockchain
          </Button>
        ) : null}
      </div>
      {step ? (
        <StepList
          label="Tiến trình gửi lại bản nháp"
          steps={REGISTER_STEPS}
          current={step}
          labels={registerStepLabels(drafts.length)}
        />
      ) : null}
      <FormAlert message={error} />

      <ul className="divide-y divide-line rounded-control border border-line">
        {items.map((item) => {
          const status = productStatusLabel(item);
          return (
            <li key={item.id} className="flex items-start gap-3 px-4 py-3.5">
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-[var(--primary)]"
                checked={selected.has(item.id)}
                onChange={() => toggle(item.id)}
                aria-label={`Chọn ${item.serialNumber}`}
              />
              <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                <div className="min-w-0">
                  <Link
                    href={`/products/${item.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {item.modelName}
                  </Link>
                  <p className="font-mono text-[13px] break-all text-muted">{item.serialNumber}</p>
                </div>
                <div className="text-sm text-muted">
                  <p>
                    Sản xuất {formatDate(`${item.manufacturedOn}T00:00:00Z`)} · Bảo hành{' '}
                    {warrantyLabel(item.warrantyMonths).toLowerCase()}
                  </p>
                  <p className="font-mono text-[13px] tracking-wider">
                    {formatPublicCode(item.publicCode)}
                  </p>
                </div>
                <div className="grid justify-items-start gap-1 sm:justify-items-end">
                  <Badge tone={status.tone} dot>
                    {status.label}
                  </Badge>
                  {locationText(item) ? (
                    <p className="text-[13px] text-muted sm:text-right">{locationText(item)}</p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
