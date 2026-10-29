'use client';

import { formatPublicCode, type ProductSummary } from '@dpp/shared';
import { Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { passportUrl, qrPngDataUrl } from './qr';

type LabelProduct = Pick<ProductSummary, 'id' | 'publicCode' | 'serialNumber' | 'modelName'>;

/**
 * Tờ tem QR để in (A4, 3 tem mỗi hàng). Mỗi tem có mã QR trỏ tới hộ chiếu công khai, kèm model,
 * serial và mã gõ tay khi không quét được.
 */
export function LabelSheet({
  products,
  baseUrl,
  issuerName,
}: {
  products: readonly LabelProduct[];
  baseUrl: string;
  issuerName: string;
}) {
  const [images, setImages] = useState<ReadonlyMap<string, string>>(new Map());

  useEffect(() => {
    let active = true;
    void Promise.all(
      products.map(
        async (product) =>
          [product.id, await qrPngDataUrl(passportUrl(baseUrl, product.publicCode), 360)] as const,
      ),
    ).then((entries) => {
      if (active) {
        setImages(new Map(entries));
      }
    });
    return () => {
      active = false;
    };
  }, [products, baseUrl]);

  const ready = images.size === products.length;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-muted">
          {products.length} tem · In khổ A4, tỉ lệ 100%. Tem hiển thị đúng như khi in.
        </p>
        <Button disabled={!ready} onClick={() => window.print()}>
          <Printer aria-hidden className="size-4" />
          {ready ? 'In tem' : 'Đang tạo mã QR…'}
        </Button>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3 print:gap-2">
        {products.map((product) => {
          const image = images.get(product.id);
          return (
            <li
              key={product.id}
              className="flex break-inside-avoid items-center gap-3 rounded-control border border-dashed border-line-strong bg-white p-3 text-[#0a2a44]"
            >
              {image ? (
                // Ảnh QR tạo trong trình duyệt nên không qua bộ tối ưu ảnh của Next.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image}
                  alt={`Mã QR ${product.serialNumber}`}
                  className="size-24 shrink-0"
                />
              ) : (
                <div aria-hidden className="size-24 shrink-0 rounded bg-[#eef4fa]" />
              )}
              <div className="min-w-0 text-[11px] leading-4">
                <p className="text-[10px] tracking-wide uppercase opacity-70">Hộ chiếu số</p>
                <p className="mt-0.5 line-clamp-2 text-[12px] font-semibold">{product.modelName}</p>
                <p className="font-mono break-all">{product.serialNumber}</p>
                <p className="mt-1 font-mono font-semibold tracking-wider">
                  {formatPublicCode(product.publicCode)}
                </p>
                <p className="mt-0.5 truncate opacity-70">{issuerName}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
