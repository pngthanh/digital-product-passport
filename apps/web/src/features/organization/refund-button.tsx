'use client';

import { formatMon } from '@dpp/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { describeWalletError } from '@/lib/wallet/wallet-errors';
import { FormAlert } from '../auth/form-alert';
import { withdrawRefund } from './organization-flows';

/** ORG-03: rút phí của đơn bị từ chối về ví cá nhân đang liên kết. */
export function RefundButton({
  amountWei,
  ...call
}: {
  amountWei: string;
  chainId: number;
  contractAddress: string;
  wallet: string;
  partyId: string;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setRunning(true);
    setError(null);
    try {
      await withdrawRefund(call);
      router.refresh();
    } catch (failure) {
      setError(describeWalletError(failure));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-3">
      <Button
        variant="secondary"
        onClick={onClick}
        disabled={running}
        className="justify-self-start"
      >
        {running ? 'Đang rút phí…' : `Rút ${formatMon(BigInt(amountWei))} MON về ví`}
      </Button>
      <FormAlert message={error} />
    </div>
  );
}
