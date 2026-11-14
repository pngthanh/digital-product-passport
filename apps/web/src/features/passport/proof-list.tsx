import type { ProductProof } from '@dpp/shared';
import { CircleAlert, CircleCheck, CircleHelp } from 'lucide-react';
import type { ReactNode } from 'react';
import { ChainLink } from '@/components/ui/chain-link';
import { HashText } from '@/components/ui/hash-text';
import { formatDate, formatTime } from '@/lib/format';

function Check({ ok, children }: { ok: boolean | null; children: ReactNode }) {
  const Icon = ok === null ? CircleHelp : ok ? CircleCheck : CircleAlert;
  return (
    <li
      className={
        ok === null
          ? 'flex items-start gap-2 text-muted'
          : ok
            ? 'flex items-start gap-2 text-ok'
            : 'flex items-start gap-2 text-bad'
      }
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </li>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/**
 * Bằng chứng để tự kiểm chứng: hash của hồ sơ đang hiển thị, kết quả đọc trực tiếp ProductPassport
 * lúc tải trang, và giao dịch đăng ký mở được trên explorer. `checks={false}` khi trang đã có khung
 * đối chiếu đầy đủ (hộ chiếu công khai, M11) và chỉ cần phần mã.
 */
export function ProofList({
  proof,
  registered,
  checks = true,
}: {
  proof: ProductProof;
  registered: boolean;
  checks?: boolean;
}) {
  return (
    <div className="grid gap-4">
      {checks ? (
        <ul className="grid gap-1.5 text-sm">
          <Check ok={proof.metadataMatchesHash}>
            {proof.metadataMatchesHash
              ? 'Băm lại hồ sơ đang hiển thị ra đúng hash đã ghi on-chain.'
              : 'Hồ sơ đang hiển thị không khớp hash đã ghi.'}
          </Check>
          {registered ? (
            <Check ok={proof.onchainMatches}>
              {proof.onchainMatches === null
                ? 'Chưa đọc được ProductPassport lúc tải trang (RPC bận). Tải lại để đối chiếu.'
                : proof.onchainMatches
                  ? 'Đọc trực tiếp ProductPassport: nhà sản xuất và hash hồ sơ khớp.'
                  : 'Dữ liệu trên ProductPassport khác hồ sơ đang hiển thị.'}
            </Check>
          ) : (
            <Check ok={null}>Chưa ghi lên blockchain.</Check>
          )}
        </ul>
      ) : null}
      <dl className="grid gap-3">
        {proof.registrationTxHash ? (
          <Row label="Giao dịch đăng ký">
            <ChainLink chainId={proof.chainId} value={proof.registrationTxHash} kind="tx" />
            {proof.registeredAt ? (
              <span className="block text-sm text-muted">
                {formatDate(proof.registeredAt)} {formatTime(proof.registeredAt)}
              </span>
            ) : null}
          </Row>
        ) : null}
        <Row label="productId on-chain">
          <HashText value={proof.productId} />
        </Row>
        <Row label="Hash hồ sơ">
          <HashText value={proof.metadataHash} />
        </Row>
        <Row label="Contract ProductPassport">
          <ChainLink chainId={proof.chainId} value={proof.contractAddress} kind="address" />
        </Row>
      </dl>
    </div>
  );
}
