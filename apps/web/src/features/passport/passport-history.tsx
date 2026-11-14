'use client';

import type { JourneyStep, JourneyStepKind } from '@dpp/shared';
import { ChainLink } from '@/components/ui/chain-link';
import { Tabs } from '@/components/ui/tabs';
import { formatDate, formatTime } from '@/lib/format';
import { INSPECTION_RESULT_LABELS } from '@/lib/state-labels';
import { partyText } from '../products/product-status';

type Category = 'distribution' | 'service' | 'inspection' | 'ownership' | 'lifecycle';
type TabId = 'all' | Category;

/** Tiêu đề, mô tả và nhóm của từng bước; lần bán đầu thuộc cả Phân phối lẫn Chuyển nhượng. */
const STEPS: Readonly<
  Record<
    JourneyStepKind,
    { title: string; categories: readonly Category[]; describe: (step: JourneyStep) => string }
  >
> = {
  REGISTERED: {
    title: 'Nhà sản xuất phát hành hộ chiếu',
    categories: ['distribution'],
    describe: (step) => partyText(step.to),
  },
  DISPATCHED: {
    title: 'Gửi hàng cho nhà bán lẻ',
    categories: ['distribution'],
    describe: (step) => `${partyText(step.from)} gửi tới ${partyText(step.to)}`,
  },
  DISPATCH_CANCELLED: {
    title: 'Huỷ lô gửi',
    categories: ['distribution'],
    describe: (step) => `${partyText(step.from)} huỷ lô gửi tới ${partyText(step.to)}`,
  },
  DISPATCH_REJECTED: {
    title: 'Nhà bán lẻ từ chối nhận',
    categories: ['distribution'],
    describe: (step) => `${partyText(step.to)} từ chối, hàng về lại ${partyText(step.from)}`,
  },
  RECEIVED: {
    title: 'Nhà bán lẻ nhận hàng',
    categories: ['distribution'],
    describe: (step) => `${partyText(step.to)} nhận từ ${partyText(step.from)}`,
  },
  SOLD: {
    title: 'Bán cho người dùng',
    categories: ['distribution', 'ownership'],
    describe: (step) => `${partyText(step.from)} bán; chủ sở hữu: ${partyText(step.to)}`,
  },
  OWNERSHIP_TRANSFERRED: {
    title: 'Chuyển quyền sở hữu',
    categories: ['ownership'],
    describe: (step) => `${partyText(step.from)} chuyển cho ${partyText(step.to)}`,
  },
  WARRANTY_ACTIVATED: {
    title: 'Kích hoạt bảo hành',
    categories: ['service'],
    describe: (step) => `${partyText(step.from)} kích hoạt khi bán`,
  },
  SERVICE_OPENED: {
    title: 'Tiếp nhận sửa chữa',
    categories: ['service'],
    describe: (step) =>
      step.warrantyCovered
        ? `${partyText(step.from)} mở phiếu, bảo hành tạm dừng trong lúc sửa`
        : `${partyText(step.from)} mở phiếu, sửa ngoài bảo hành`,
  },
  SERVICE_REPAIRED: {
    title: 'Sửa xong',
    categories: ['service'],
    describe: (step) => `${partyText(step.from)} đóng phiếu, biên bản đã ghi hash`,
  },
  SERVICE_REJECTED: {
    title: 'Không sửa được',
    categories: ['service'],
    describe: (step) => `${partyText(step.from)} đóng phiếu, biên bản đã ghi hash`,
  },
  INSPECTED: {
    title: 'Kiểm định',
    categories: ['inspection'],
    describe: (step) =>
      `${partyText(step.from)}: ${step.inspectionResult ? INSPECTION_RESULT_LABELS[step.inspectionResult].label : 'đã ghi kết quả'}, biên bản đã ghi hash`,
  },
  RECALLED: {
    title: 'Nhà sản xuất thu hồi',
    categories: ['lifecycle'],
    describe: (step) => `${partyText(step.from)} thu hồi, lý do đã ghi hash`,
  },
  REPORTED_LOST_STOLEN: {
    title: 'Báo mất hoặc bị trộm',
    categories: ['lifecycle'],
    describe: (step) => `${partyText(step.from)} báo mất`,
  },
  RETIRED: {
    title: 'Ngừng sử dụng',
    categories: ['lifecycle'],
    describe: (step) => `${partyText(step.from)} ngừng sử dụng`,
  },
};

const TABS: readonly { id: TabId; label: string; empty: string }[] = [
  { id: 'all', label: 'Tất cả', empty: 'Chưa có sự kiện nào được ghi nhận.' },
  { id: 'distribution', label: 'Phân phối', empty: 'Chưa có lần phát hành hay bàn giao nào.' },
  { id: 'service', label: 'Bảo hành', empty: 'Chưa có lần kích hoạt bảo hành hay sửa chữa nào.' },
  { id: 'inspection', label: 'Kiểm định', empty: 'Chưa có kết quả kiểm định nào.' },
  { id: 'ownership', label: 'Chuyển nhượng', empty: 'Chưa có lần đổi chủ nào.' },
  {
    id: 'lifecycle',
    label: 'Thu hồi, báo mất',
    empty: 'Sản phẩm chưa bị thu hồi, báo mất hay ngừng sử dụng.',
  },
];

function stepsOf(steps: readonly JourneyStep[], tab: TabId) {
  return tab === 'all' ? steps : steps.filter((step) => STEPS[step.kind].categories.includes(tab));
}

/**
 * Hành trình đã ghi trên blockchain (mới nhất trước), chia tab Phân phối, Bảo hành, Kiểm định,
 * Chuyển nhượng, Thu hồi và báo mất;
 * mỗi bước mở được giao dịch trên explorer. Người mua không hiện tên.
 */
export function PassportHistory({
  steps,
  chainId,
  className = 'px-6 py-4',
  heading = 'Lịch sử đã ghi nhận',
  headingClassName = 'text-sm font-medium',
}: {
  steps: readonly JourneyStep[];
  chainId: number;
  className?: string;
  heading?: string;
  headingClassName?: string;
}) {
  const ordered = steps.toReversed();
  const tabs = TABS.map((tab) => ({
    id: tab.id,
    label: tab.label,
    count: stepsOf(ordered, tab.id).length,
  }));

  return (
    <section className={className}>
      <h3 className={headingClassName}>{heading}</h3>
      <Tabs label="Lọc lịch sử theo nhóm sự kiện" items={tabs} className="mt-3">
        {(active) => {
          const visible = stepsOf(ordered, active);
          if (visible.length === 0) {
            return (
              <p className="py-4 text-sm text-muted">
                {TABS.find((tab) => tab.id === active)?.empty}
              </p>
            );
          }
          return (
            <ol className="mt-4 space-y-3 border-l border-line pl-4">
              {visible.map((step) => (
                <li key={`${step.txHash}-${step.kind}`} className="relative">
                  <span
                    aria-hidden
                    className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-surface bg-primary"
                  />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-sm font-medium">{STEPS[step.kind].title}</p>
                    <time dateTime={step.at} className="text-xs text-muted tabular-nums">
                      {formatDate(step.at)} {formatTime(step.at)}
                    </time>
                  </div>
                  <p className="text-sm text-muted">{STEPS[step.kind].describe(step)}</p>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                    Giao dịch <ChainLink chainId={chainId} value={step.txHash} kind="tx" />
                  </p>
                </li>
              ))}
            </ol>
          );
        }}
      </Tabs>
    </section>
  );
}
