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
import { coverageText, ServiceRecord } from '@/features/service/service-record';
import { serviceTicketDetailSchema } from '@/features/service/service.schema';
import { OpenTicketAction, TicketResultForm } from '@/features/service/ticket-actions';
import { daysLeft } from '@/features/warranty/warranty-summary';
import { serverChainId } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { serverGet } from '@/lib/server-api';
import { SERVICE_STATE_LABELS, WARRANTY_STATE_LABELS } from '@/lib/state-labels';

export const metadata: Metadata = { title: 'Phiếu sửa chữa' };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-0.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** Một phiếu của trung tâm: SVC-03 tiếp nhận và mở phiếu, SVC-04 ghi biên bản và đóng phiếu. */
export default async function ServiceTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const identity = await getIdentity();
  if (!identity) {
    redirect('/login');
  }
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    notFound();
  }
  const ticket = await serverGet(`/me/service-tickets/${id}`, serviceTicketDetailSchema);
  if (!ticket) {
    notFound();
  }
  const chainId = serverChainId();
  const state = SERVICE_STATE_LABELS[ticket.state];
  const wallet = identity.wallets.find((candidate) => candidate.status === 'ACTIVE')?.address;
  const warranty = ticket.warranty;
  const filter =
    ticket.state === 'REQUESTED'
      ? 'REQUESTED'
      : ticket.state === 'IN_REPAIR'
        ? 'IN_REPAIR'
        : 'CLOSED';
  const noWallet = (
    <p className="text-sm text-warn">Liên kết ví MetaMask ở trang Tài khoản trước.</p>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href={{ pathname: '/service', query: { filter } }}
        className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
      >
        ← Bảo hành
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{ticket.product.modelName}</h1>
        <Badge tone={state.tone} dot>
          {state.label}
        </Badge>
      </div>
      <p className="mt-1 font-mono text-sm break-all text-muted">{ticket.product.serialNumber}</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 content-start gap-6">
          {ticket.state === 'REQUESTED' ? (
            <Panel className="px-5 py-5" aria-labelledby="tiep-nhan">
              <h2 id="tiep-nhan" className="font-semibold">
                Tiếp nhận sửa chữa
              </h2>
              <p className="mt-1 mb-4 text-sm text-muted">
                {warranty?.state === 'ACTIVE'
                  ? `Sản phẩm còn bảo hành tới ${formatDate(warranty.expiresAt)}: phiếu "trong bảo hành", bảo hành tạm dừng trong lúc sửa và tiếp tục khi đóng phiếu (không cộng thêm thời gian).`
                  : 'Sản phẩm không còn bảo hành: phiếu được ghi "ngoài bảo hành".'}{' '}
                Mở phiếu xong, chủ sở hữu không huỷ yêu cầu được nữa.
              </p>
              {wallet ? <OpenTicketAction requestId={ticket.id} /> : noWallet}
            </Panel>
          ) : null}

          {ticket.state === 'IN_REPAIR' ? (
            <Panel className="px-5 py-5" aria-labelledby="ket-qua">
              <h2 id="ket-qua" className="font-semibold">
                Ghi kết quả và đóng phiếu
              </h2>
              <p className="mt-1 mb-4 text-sm text-muted">
                Biên bản (kết quả, việc đã làm, ghi chú và file) được băm thành một hash ghi lên
                blockchain; sửa biên bản về sau sẽ không còn khớp hash.
              </p>
              {wallet ? <TicketResultForm requestId={ticket.id} /> : noWallet}
            </Panel>
          ) : null}

          <Panel className="px-5 py-5" aria-labelledby="yeu-cau">
            <h2 id="yeu-cau" className="mb-4 font-semibold">
              Yêu cầu của chủ sở hữu
            </h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Item label="Chủ sở hữu">
                {ticket.requester.fullName}
                <span className="block text-sm text-muted">{ticket.requester.maskedEmail}</span>
              </Item>
              <Item label="Ngày gửi">{formatDate(ticket.requestedAt)}</Item>
              <Item label="Nhà sản xuất">{ticket.product.issuer.name}</Item>
              <Item label="Mã tra cứu">
                <span className="font-mono text-[14px] tracking-wider">
                  {formatPublicCode(ticket.product.publicCode)}
                </span>
              </Item>
              <div className="sm:col-span-2">
                <Item label="Mô tả lỗi">
                  <span className="whitespace-pre-line">{ticket.issueDesc}</span>
                </Item>
              </div>
            </dl>
          </Panel>

          {ticket.openedAt ? (
            <Panel className="px-5 py-5" aria-labelledby="phieu">
              <h2 id="phieu" className="mb-4 font-semibold">
                Phiếu sửa chữa
              </h2>
              <ServiceRecord request={ticket} chainId={chainId} />
            </Panel>
          ) : null}
          <Panel className="px-5 py-5" aria-labelledby="blockchain">
            <h2 id="blockchain" className="mb-3 font-semibold">
              Trên blockchain
            </h2>
            <p className="mb-3 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
              Mã phiếu <HashText value={ticket.ticketId} />
            </p>
            <ChainLog events={ticket.history} chainId={chainId} />
          </Panel>
        </div>

        <div className="grid content-start gap-6">
          <Panel className="px-5 py-5" aria-labelledby="bao-hanh">
            <h2 id="bao-hanh" className="mb-3 font-semibold">
              Bảo hành
            </h2>
            {warranty ? (
              <div className="grid gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={WARRANTY_STATE_LABELS[warranty.state].tone} dot>
                    {WARRANTY_STATE_LABELS[warranty.state].label}
                  </Badge>
                  {warranty.state === 'EXPIRED' ? null : (
                    <span className="text-muted">còn {daysLeft(warranty.expiresAt)} ngày</span>
                  )}
                </div>
                <p className="text-muted">Đến ngày {formatDate(warranty.expiresAt)}</p>
              </div>
            ) : (
              <p className="text-sm text-muted">Sản phẩm không có bảo hành.</p>
            )}
            {coverageText(ticket.warrantyCovered) ? (
              <p className="mt-3 text-sm">Phiếu: {coverageText(ticket.warrantyCovered)}</p>
            ) : null}
          </Panel>
          <ButtonLink
            href={`/p/${ticket.product.publicCode}`}
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
