import { formatMon, parseMon } from '@dpp/shared';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { HashText } from '@/components/ui/hash-text';
import { Panel } from '@/components/ui/panel';
import {
  PRODUCT_STATE_LABELS,
  SERVICE_STATE_LABELS,
  type StateLabel,
  TRANSFER_STATE_LABELS,
  WALLET_STATUS_LABELS,
  WARRANTY_STATE_LABELS,
} from '@/lib/state-labels';

export const metadata: Metadata = { title: 'Bộ giao diện' };

const SWATCHES: ReadonlyArray<{ name: string; token: string; usage: string }> = [
  { name: 'Biển sâu', token: 'bg-primary', usage: 'Hành động chính, nhận diện' },
  { name: 'Sóng', token: 'bg-focus', usage: 'Viền focus, liên kết' },
  { name: 'Bọt', token: 'bg-tint', usage: 'Nền mục đang chọn, dải MRZ' },
  { name: 'Đá', token: 'bg-canvas', usage: 'Nền trang' },
  { name: 'Mực', token: 'bg-ink', usage: 'Chữ chính' },
  { name: 'Sương', token: 'bg-muted', usage: 'Chữ phụ' },
  { name: 'Rêu', token: 'bg-ok', usage: 'Hoạt động, hợp lệ' },
  { name: 'Hổ phách', token: 'bg-warn', usage: 'Cần chú ý' },
  { name: 'San hô', token: 'bg-bad', usage: 'Lỗi, thu hồi' },
];

const STATE_GROUPS: ReadonlyArray<{ title: string; labels: Record<string, StateLabel> }> = [
  { title: 'Sản phẩm', labels: PRODUCT_STATE_LABELS },
  { title: 'Bảo hành', labels: WARRANTY_STATE_LABELS },
  { title: 'Phiếu dịch vụ', labels: SERVICE_STATE_LABELS },
  { title: 'Chuyển quyền', labels: TRANSFER_STATE_LABELS },
  { title: 'Ví', labels: WALLET_STATUS_LABELS },
];

const SAMPLE_ADDRESS = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed';
const SAMPLE_TX = '0x9f3a6d0c2e8b5f1a4d7c0e3b9f6a2d5c8e1b4f7a0d3c6e9b2f5a8d1c4e7b0a3c';

function KitSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-6 border-t border-line py-10 md:grid-cols-[14rem_1fr] md:gap-10">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

export default function UiKitPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="max-w-2xl pb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Bộ giao diện</h1>
        <p className="mt-3 text-muted">
          Thành phần dùng chung cho mọi module. Thêm màn hình mới thì lắp từ đây thay vì tự viết
          CSS, để toàn bộ hệ thống giữ cùng một giọng.
        </p>
      </div>

      <KitSection
        title="Màu"
        description="Xanh đại dương đậm và xám lạnh. Tự đổi theo chế độ sáng/tối, không dùng gradient."
      >
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {SWATCHES.map((swatch) => (
            <li key={swatch.name} className="flex items-center gap-3">
              <span
                aria-hidden
                className={`size-10 shrink-0 rounded-control border border-line ${swatch.token}`}
              />
              <span>
                <span className="block text-sm font-medium">{swatch.name}</span>
                <span className="block text-xs text-muted">{swatch.usage}</span>
              </span>
            </li>
          ))}
        </ul>
      </KitSection>

      <KitSection
        title="Chữ"
        description="Be Vietnam Pro cho giao diện; JetBrains Mono chỉ cho dữ liệu máy như serial, hash, địa chỉ ví."
      >
        <div className="space-y-4">
          <p className="text-4xl leading-tight font-semibold tracking-tight">Tiêu đề trang 36</p>
          <p className="text-2xl font-semibold tracking-tight">Tiêu đề mục 24</p>
          <p className="text-[17px] leading-8 text-muted">
            Đoạn dẫn 17: mô tả ngắn đi kèm tiêu đề.
          </p>
          <p className="text-[15px] leading-7">
            Nội dung 15: chữ đọc chính trong bảng và biểu mẫu.
          </p>
          <p className="text-sm text-muted">Chú thích 14: thông tin phụ, thời điểm, gợi ý.</p>
          <p className="font-mono text-[13px]">ABC-2026-000128</p>
        </div>
      </KitSection>

      <KitSection
        title="Nút"
        description="Mỗi màn hình chỉ có một nút chính. Nhãn nói rõ việc sẽ xảy ra."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button>Tạo yêu cầu chuyển quyền</Button>
          <Button variant="secondary">Xem lịch sử</Button>
          <Button variant="ghost">Huỷ</Button>
          <Button variant="danger">Thu hồi sản phẩm</Button>
          <Button size="sm">Nút nhỏ</Button>
          <Button disabled>Đang gửi giao dịch…</Button>
        </div>
      </KitSection>

      <KitSection
        title="Nhãn trạng thái"
        description="Bốn state machine dùng bốn bộ nhãn riêng, màu theo mức độ cần chú ý."
      >
        <div className="space-y-4">
          {STATE_GROUPS.map((group) => (
            <div key={group.title} className="flex flex-wrap items-center gap-2">
              <span className="w-28 shrink-0 text-sm text-muted">{group.title}</span>
              {Object.entries(group.labels).map(([state, label]) => (
                <Badge key={state} tone={label.tone} dot>
                  {label.label}
                </Badge>
              ))}
            </div>
          ))}
        </div>
      </KitSection>

      <KitSection
        title="Ô nhập"
        description="Nhãn luôn hiển thị; lỗi nói rõ sai ở đâu và sửa thế nào."
      >
        <div className="grid max-w-md gap-5">
          <Field label="Số serial" help="In trên tem dưới đáy máy, ví dụ ABC-2026-000128.">
            {(control) => <Input {...control} placeholder="ABC-2026-000128" />}
          </Field>
          <Field
            label="Địa chỉ ví bên nhận"
            error="Địa chỉ phải bắt đầu bằng 0x và có 40 ký tự hex."
          >
            {(control) => (
              <Input {...control} defaultValue="0x12ab" className="font-mono text-[13px]" />
            )}
          </Field>
        </div>
      </KitSection>

      <KitSection
        title="Dữ liệu on-chain"
        description="Hash và địa chỉ hiển thị rút gọn, có nút chép bản đầy đủ."
      >
        <Panel>
          <dl className="divide-y divide-line text-sm">
            <div className="flex items-center justify-between gap-4 px-5 py-3">
              <dt className="text-muted">Địa chỉ ví</dt>
              <dd>
                <HashText value={SAMPLE_ADDRESS} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-5 py-3">
              <dt className="text-muted">Mã giao dịch</dt>
              <dd>
                <HashText value={SAMPLE_TX} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-5 py-3">
              <dt className="text-muted">Phí đăng ký tổ chức</dt>
              <dd className="font-medium tabular-nums">
                {formatMon(parseMon('8'))} MON + gas mạng
              </dd>
            </div>
          </dl>
        </Panel>
      </KitSection>
    </div>
  );
}
