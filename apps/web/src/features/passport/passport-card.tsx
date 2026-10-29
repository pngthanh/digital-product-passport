import { formatPublicCode, type PublicPassportView } from '@dpp/shared';
import { BadgeCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import { ORG_TYPE_LABELS, PRODUCT_STATE_LABELS } from '@/lib/state-labels';
import { buildProductMrz } from '../passport-specimen/mrz';
import { warrantyLabel } from '../products/product-status';
import { PassportHistory } from './passport-history';

/** Trang dữ liệu của hộ chiếu số thật, cùng bố cục với hồ sơ mẫu ở trang chủ (kèm dải MRZ). */
export function PassportCard({ passport }: { passport: PublicPassportView }) {
  const state = PRODUCT_STATE_LABELS[passport.productState];
  const mrz = buildProductMrz({
    issuer: passport.issuer.name,
    model: passport.modelName,
    serial: passport.serialNumber,
    chainId: passport.proof.chainId,
    state: passport.productState,
  });

  return (
    <article
      aria-label={`Hộ chiếu số của ${passport.modelName}`}
      className="overflow-hidden rounded-[14px] border border-line-strong bg-surface"
    >
      <header className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
        <div className="min-w-0">
          <p className="text-sm text-muted">Hộ chiếu số</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{passport.modelName}</h1>
          <p className="mt-0.5 font-mono text-sm break-all text-muted">{passport.serialNumber}</p>
        </div>
        <Badge tone={state.tone} dot className="shrink-0">
          {state.label}
        </Badge>
      </header>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 border-y border-line px-6 py-4 text-sm">
        <dt className="text-muted">Nhà phát hành</dt>
        <dd>
          <span className="font-medium">{passport.issuer.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-muted">
            {ORG_TYPE_LABELS[passport.issuer.orgType]} · MST {passport.issuer.taxCode}
            {passport.issuer.authStatus === 'AUTHORIZED' ? (
              <span className="inline-flex items-center gap-1 text-ok">
                <BadgeCheck aria-hidden className="size-4" />
                Đã được duyệt
              </span>
            ) : (
              <span className="text-warn">Doanh nghiệp đã bị khoá</span>
            )}
          </span>
        </dd>
        <dt className="text-muted">Ngày sản xuất</dt>
        <dd>{formatDate(`${passport.manufacturedOn}T00:00:00Z`)}</dd>
        <dt className="text-muted">Bảo hành</dt>
        <dd>
          {passport.warrantyMonths === 0
            ? 'Không bảo hành'
            : `${warrantyLabel(passport.warrantyMonths)}, tính từ ngày bán`}
        </dd>
        <dt className="text-muted">Bên đang giữ</dt>
        <dd>{passport.custodian?.name ?? 'Người dùng cá nhân'}</dd>
        <dt className="text-muted">Mã tra cứu</dt>
        <dd className="font-mono tracking-wider">{formatPublicCode(passport.publicCode)}</dd>
      </dl>

      <PassportHistory
        events={passport.history}
        chainId={passport.proof.chainId}
        issuerName={passport.issuer.name}
      />

      <footer className="overflow-x-auto bg-tint px-6 py-3" aria-label="Dải đọc máy (MRZ)">
        {mrz.map((line) => (
          <p
            key={line}
            className="font-mono text-[12px] leading-5 tracking-[0.14em] whitespace-pre text-tint-ink"
          >
            {line}
          </p>
        ))}
      </footer>
    </article>
  );
}
