import { formatPublicCode } from '@dpp/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { HashText } from '@/components/ui/hash-text';
import { Panel } from '@/components/ui/panel';
import { getIdentity } from '@/features/auth/get-identity';
import { ChainLog } from '@/features/chain-log/chain-log';
import { inspectionDetailSchema } from '@/features/inspection/inspection.schema';
import { InspectionReport } from '@/features/inspection/inspection-report';
import {
  DeclineInspectionForm,
  InspectionResultForm,
} from '@/features/inspection/inspector-actions';
import { BROWSER_API_BASE, serverChainId } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { serverGet } from '@/lib/server-api';
import { INSPECTION_REQUEST_STATE_LABELS, PRODUCT_STATE_LABELS } from '@/lib/state-labels';

export const metadata: Metadata = { title: 'Yêu cầu kiểm định' };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-0.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** Một yêu cầu của đơn vị kiểm định: INS-01 ghi kết quả, INS-04 từ chối kèm lý do. */
export default async function InspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const identity = await getIdentity();
  if (!identity) {
    redirect('/login');
  }
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    notFound();
  }
  const inspection = await serverGet(`/me/inspections/${id}`, inspectionDetailSchema);
  if (!inspection) {
    notFound();
  }
  const chainId = serverChainId();
  const state = INSPECTION_REQUEST_STATE_LABELS[inspection.state];
  const productState = PRODUCT_STATE_LABELS[inspection.product.productState];
  const wallet = identity.wallets.find((candidate) => candidate.status === 'ACTIVE')?.address;
  const filter =
    inspection.state === 'REQUESTED' || inspection.state === 'COMPLETED'
      ? inspection.state
      : 'CLOSED';
  const requester = inspection.requester;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href={{ pathname: '/inspection', query: { filter } }}
        className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
      >
        ← Kiểm định
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{inspection.product.modelName}</h1>
        <Badge tone={state.tone} dot>
          {state.label}
        </Badge>
      </div>
      <p className="mt-1 font-mono text-sm break-all text-muted">
        {inspection.product.serialNumber}
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 content-start gap-6">
          {inspection.state === 'REQUESTED' ? (
            <Panel className="px-5 py-5" aria-labelledby="ket-qua">
              <h2 id="ket-qua" className="font-semibold">
                Ghi kết quả kiểm định
              </h2>
              <p className="mt-1 mb-4 text-sm text-muted">
                Kết quả, kết luận và file được băm thành một hash ghi lên blockchain; sửa biên bản
                về sau sẽ không còn khớp hash. Không đạt chỉ được ghi nhận, không đổi trạng thái sản
                phẩm.
              </p>
              {inspection.report?.syncStatus === 'PENDING' ? (
                <div className="mb-4 rounded-control border border-line p-3">
                  <p className="mb-2 text-sm font-medium">
                    Biên bản đã lưu, chờ ghi lên blockchain
                  </p>
                  <InspectionReport
                    report={{ ...inspection.report, confirmed: false }}
                    fileHref={`${BROWSER_API_BASE}/me/inspections/${inspection.id}/report`}
                    chainId={chainId}
                  />
                </div>
              ) : null}
              {wallet ? (
                <InspectionResultForm requestId={inspection.id} />
              ) : (
                <p className="text-sm text-warn">Liên kết ví MetaMask ở trang Tài khoản trước.</p>
              )}
            </Panel>
          ) : null}

          {inspection.state === 'COMPLETED' && inspection.report ? (
            <Panel className="px-5 py-5" aria-labelledby="bien-ban">
              <h2 id="bien-ban" className="mb-4 font-semibold">
                Kết quả đã ghi
              </h2>
              <InspectionReport
                report={{
                  ...inspection.report,
                  confirmed: inspection.report.syncStatus === 'CONFIRMED',
                }}
                fileHref={`${BROWSER_API_BASE}/me/inspections/${inspection.id}/report`}
                chainId={chainId}
              />
            </Panel>
          ) : null}

          <Panel className="px-5 py-5" aria-labelledby="yeu-cau">
            <h2 id="yeu-cau" className="mb-4 font-semibold">
              Yêu cầu
            </h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Item
                label={requester.kind === 'MANUFACTURER' ? 'Nhà sản xuất gửi' : 'Chủ sở hữu gửi'}
              >
                {requester.kind === 'MANUFACTURER' ? (
                  requester.name
                ) : (
                  <>
                    {requester.fullName}
                    <span className="block text-sm text-muted">{requester.maskedEmail}</span>
                  </>
                )}
              </Item>
              <Item label="Ngày gửi">{formatDate(inspection.requestedAt)}</Item>
              <Item label="Nhà sản xuất">{inspection.product.issuer.name}</Item>
              <Item label="Mã tra cứu">
                <span className="font-mono text-[14px] tracking-wider">
                  {formatPublicCode(inspection.product.publicCode)}
                </span>
              </Item>
              <div className="sm:col-span-2">
                <Item label="Nội dung cần kiểm định">
                  <span className="whitespace-pre-line">{inspection.note}</span>
                </Item>
              </div>
              {inspection.declineReason ? (
                <div className="sm:col-span-2">
                  <Item label="Lý do từ chối">{inspection.declineReason}</Item>
                </div>
              ) : null}
            </dl>
          </Panel>

          <Panel className="px-5 py-5" aria-labelledby="blockchain">
            <h2 id="blockchain" className="mb-3 font-semibold">
              Trên blockchain
            </h2>
            <p className="mb-3 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
              Mã kiểm định <HashText value={inspection.inspectionId} />
            </p>
            <ChainLog events={inspection.history} chainId={chainId} />
          </Panel>
        </div>

        <div className="grid content-start gap-6">
          <Panel className="px-5 py-5" aria-labelledby="san-pham">
            <h2 id="san-pham" className="mb-3 font-semibold">
              Sản phẩm
            </h2>
            <Badge tone={productState.tone} dot>
              {productState.label}
            </Badge>
          </Panel>
          {inspection.state === 'REQUESTED' ? (
            <Panel className="px-5 py-5" aria-labelledby="tu-choi">
              <h2 id="tu-choi" className="mb-1 font-semibold">
                Từ chối
              </h2>
              <p className="mb-4 text-sm text-muted">
                Không tốn gas. Người gửi thấy lý do và có thể gửi yêu cầu tới đơn vị khác.
              </p>
              <DeclineInspectionForm requestId={inspection.id} />
            </Panel>
          ) : null}
          <ButtonLink
            href={`/p/${inspection.product.publicCode}`}
            variant="secondary"
            className="justify-self-start"
          >
            Xem hộ chiếu công khai
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
