'use client';

import type { ProductSaleAuthorization } from '@dpp/shared';
import { BadgeCheck, ShoppingBag } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { StepList } from '@/components/ui/step-list';
import { describeWalletError } from '@/lib/wallet/wallet-errors';
import { FormAlert } from '../auth/form-alert';
import { warrantyLabel } from '../products/product-status';
import { custodyStepLabels } from './custody-steps';
import {
  CUSTODY_STEPS,
  type CustodyStep,
  type PassportTarget,
  prepareSale,
  sellProduct,
} from './distribution-flows';

/**
 * DST-03 phía nhà bán lẻ: nhập email tài khoản của người mua (người mua chưa cần ví MetaMask), xác
 * nhận đúng người, rồi ví cửa hàng ký giao dịch bán; bảo hành bắt đầu ngay trong giao dịch đó.
 */
export function SaleForm({ target }: { target: PassportTarget }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [checking, setChecking] = useState(false);
  const [sale, setSale] = useState<ProductSaleAuthorization | null>(null);
  const [step, setStep] = useState<CustodyStep | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setChecking(true);
    try {
      setSale(await prepareSale(target.productId, email));
    } catch (failure) {
      setError(describeWalletError(failure));
    } finally {
      setChecking(false);
    }
  }

  async function sell(authorization: ProductSaleAuthorization) {
    setError(null);
    try {
      await sellProduct(target, authorization, setStep);
      router.refresh();
    } catch (failure) {
      setError(describeWalletError(failure));
      setStep(null);
    }
  }

  if (sale) {
    return (
      <div className="grid gap-4">
        <div className="grid gap-1 rounded-control border border-line bg-tint/40 px-4 py-3">
          <p className="flex items-center gap-2 font-medium">
            <BadgeCheck aria-hidden className="size-4 text-ok" />
            {sale.buyer.fullName}
          </p>
          <p className="text-sm text-muted">{sale.buyer.maskedEmail}</p>
          <p className="text-sm">
            Bảo hành:{' '}
            {sale.warrantyMonths === 0
              ? 'không bảo hành'
              : `${warrantyLabel(sale.warrantyMonths)}, tính từ lúc giao dịch bán được ghi`}
          </p>
        </div>
        {step ? (
          <StepList
            label="Tiến trình bán hàng"
            steps={CUSTODY_STEPS}
            current={step}
            labels={custodyStepLabels('sellAndActivateWarranty')}
          />
        ) : null}
        <FormAlert message={error} />
        <div className="flex flex-wrap gap-2">
          <Button disabled={step !== null} onClick={() => void sell(sale)}>
            <ShoppingBag aria-hidden className="size-4" />
            Xác nhận bán và kích hoạt bảo hành
          </Button>
          <Button
            variant="ghost"
            disabled={step !== null}
            onClick={() => {
              setSale(null);
              setError(null);
            }}
          >
            Đổi người mua
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void check(event)} noValidate className="grid gap-3">
      <Field
        label="Email tài khoản của người mua"
        help="Người mua tạo tài khoản ở trang Đăng ký (chưa cần ví MetaMask). Quyền sở hữu và bảo hành gắn với tài khoản này."
      >
        {(props) => (
          <Input
            {...props}
            type="email"
            name="buyerEmail"
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="khachhang@gmail.com"
          />
        )}
      </Field>
      <FormAlert message={error} />
      <Button
        type="submit"
        variant="secondary"
        className="justify-self-start"
        disabled={checking || !email.trim()}
      >
        {checking ? 'Đang kiểm tra…' : 'Kiểm tra người mua'}
      </Button>
    </form>
  );
}
