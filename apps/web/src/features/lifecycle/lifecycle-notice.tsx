import type { LifecycleNotice, LifecycleState } from '@dpp/shared';
import { AlertTriangle, Ban, PackageX } from 'lucide-react';
import { ChainLink } from '@/components/ui/chain-link';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';

/** Ai đang xem: lời khuyên khác nhau cho người tra cứu, chủ sở hữu, nhà bán lẻ, nhà sản xuất. */
export type NoticeAudience = 'public' | 'owner' | 'retailer' | 'manufacturer';

const TITLES: Record<LifecycleState, string> = {
  RECALLED: 'Sản phẩm đã bị nhà sản xuất thu hồi',
  LOST_STOLEN: 'Chủ sở hữu đã báo sản phẩm bị mất hoặc bị trộm',
  RETIRED: 'Sản phẩm đã ngừng sử dụng',
};

const ADVICE: Record<LifecycleState, Record<NoticeAudience, string>> = {
  RECALLED: {
    public:
      'Không nên mua bán lại sản phẩm này. Liên hệ nhà sản xuất hoặc nơi bán để được hướng dẫn.',
    owner:
      'Ngừng sử dụng và liên hệ nhà sản xuất hoặc nơi bán để được hướng dẫn. Sản phẩm không chuyển nhượng, gửi bảo hành hay kiểm định được nữa.',
    retailer: 'Gỡ sản phẩm khỏi kệ. Sản phẩm không bán được nữa.',
    manufacturer:
      'Chủ sở hữu và nhà bán lẻ đang giữ hàng đã được thông báo. Thu hồi là trạng thái cuối, không hoàn tác.',
  },
  LOST_STOLEN: {
    public:
      'Nếu bạn đang được mời mua lại sản phẩm này, hãy cẩn trọng và báo cho cơ quan chức năng.',
    owner:
      'Báo mất là trạng thái cuối. Sản phẩm không chuyển nhượng, gửi bảo hành hay kiểm định được nữa.',
    retailer: 'Không nhận mua lại sản phẩm này.',
    manufacturer: 'Sản phẩm không thu hồi được nữa vì đã ở trạng thái cuối.',
  },
  RETIRED: {
    public: 'Chủ sở hữu đã ngừng sử dụng sản phẩm (thanh lý hoặc tiêu huỷ).',
    owner:
      'Ngừng sử dụng là trạng thái cuối. Sản phẩm không chuyển nhượng, gửi bảo hành hay kiểm định được nữa.',
    retailer: 'Không nhận mua lại sản phẩm này.',
    manufacturer: 'Sản phẩm không thu hồi được nữa vì đã ở trạng thái cuối.',
  },
};

const TONES: Record<LifecycleState, string> = {
  RECALLED: 'border-bad/40 bg-bad-tint text-bad',
  LOST_STOLEN: 'border-warn/40 bg-warn-tint text-warn',
  RETIRED: 'border-line bg-canvas text-ink',
};

const ICONS = { RECALLED: Ban, LOST_STOLEN: AlertTriangle, RETIRED: PackageX } as const;

/**
 * Cảnh báo trạng thái cuối (M10) trên hộ chiếu và các trang sản phẩm: thu hồi kèm lý do của nhà
 * sản xuất, báo mất, ngừng sử dụng; có giao dịch để tự kiểm chứng. Không có thông tin chủ sở hữu.
 */
export function LifecycleNoticeBanner({
  notice,
  chainId,
  audience,
  className,
}: {
  notice: LifecycleNotice;
  chainId: number;
  audience: NoticeAudience;
  className?: string;
}) {
  const Icon = ICONS[notice.state];
  return (
    <section
      role={notice.state === 'RETIRED' ? 'note' : 'alert'}
      className={cn('grid gap-2 rounded-panel border px-5 py-4', TONES[notice.state], className)}
    >
      <h2 className="flex items-start gap-2 font-semibold">
        <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
        {TITLES[notice.state]}
      </h2>
      <div className="grid gap-2 text-sm text-ink">
        {notice.recall ? (
          <>
            <p>
              <span className="text-muted">Nhà sản xuất: </span>
              {notice.recall.issuerName}
            </p>
            <p className="whitespace-pre-line">
              <span className="text-muted">Lý do: </span>
              {notice.recall.reason}
            </p>
          </>
        ) : null}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {notice.at ? <span>Từ ngày {formatDate(notice.at)}</span> : null}
          {notice.txHash ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-muted">Giao dịch</span>
              <ChainLink chainId={chainId} value={notice.txHash} kind="tx" />
            </span>
          ) : null}
        </p>
        <p className="text-muted">{ADVICE[notice.state][audience]}</p>
      </div>
    </section>
  );
}
