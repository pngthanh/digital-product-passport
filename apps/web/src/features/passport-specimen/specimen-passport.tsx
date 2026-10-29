import { MONAD_TESTNET } from '@dpp/shared';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import { PRODUCT_STATE_LABELS, WARRANTY_STATE_LABELS } from '@/lib/state-labels';
import { buildProductMrz } from './mrz';
import { SPECIMEN_PASSPORT as passport } from './specimen-data';
import { SpecimenHistory } from './specimen-history';

/** Trang dữ liệu của một hộ chiếu số, dựng theo bố cục hộ chiếu thật kèm dải MRZ. */
export function SpecimenPassport() {
  const productState = PRODUCT_STATE_LABELS[passport.productState];
  const warranty = WARRANTY_STATE_LABELS[passport.warrantyState];
  const mrz = buildProductMrz({
    issuer: passport.issuer,
    model: passport.model,
    serial: passport.serial,
    chainId: MONAD_TESTNET.chainId,
    state: passport.productState,
  });

  return (
    <article
      aria-label={`Hồ sơ mẫu của ${passport.model}`}
      className="overflow-hidden rounded-[14px] border border-line-strong bg-surface"
    >
      <header className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
        <div>
          <p className="text-sm text-muted">Hồ sơ mẫu</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">{passport.model}</h2>
          <p className="mt-0.5 font-mono text-sm text-muted">{passport.serial}</p>
        </div>
        <Badge tone={productState.tone} dot>
          {productState.label}
        </Badge>
      </header>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-y border-line px-6 py-4 text-sm">
        <dt className="text-muted">Nhà phát hành</dt>
        <dd>{passport.issuer}</dd>
        <dt className="text-muted">Bảo hành</dt>
        <dd>
          {warranty.label} đến {formatDate(passport.warrantyExpiresAt)}
        </dd>
        <dt className="text-muted">Chủ sở hữu</dt>
        <dd>{passport.ownerVisibility}</dd>
      </dl>

      <SpecimenHistory events={passport.events} />

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
