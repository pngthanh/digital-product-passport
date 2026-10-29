'use client';

import { formatPublicCode } from '@dpp/shared';
import { Download, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { downloadHref, downloadText, passportUrl, qrFileName, qrPngDataUrl, qrSvg } from './qr';

/** Ảnh PNG tải về đủ lớn để in tem sắc nét (khoảng 8,7 cm ở 300 dpi). */
const DOWNLOAD_WIDTH = 1024;

/**
 * Mã QR riêng của sản phẩm: trỏ tới trang hộ chiếu công khai `/p/<mã>`. Tải PNG để dán vào tài
 * liệu, SVG để in tem không vỡ nét; ai quét mã cũng xem được hộ chiếu mà không cần đăng nhập.
 */
export function ProductQr({
  baseUrl,
  productId,
  publicCode,
  serialNumber,
  modelName,
  registered,
}: {
  baseUrl: string;
  productId: string;
  publicCode: string;
  serialNumber: string;
  modelName: string;
  /** Bản nháp đã có mã nhưng trang hộ chiếu chỉ mở khi sản phẩm lên blockchain. */
  registered: boolean;
}) {
  const url = passportUrl(baseUrl, publicCode);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void qrPngDataUrl(url, 480).then((dataUrl) => {
      if (active) {
        setPreview(dataUrl);
      }
    });
    return () => {
      active = false;
    };
  }, [url]);

  async function downloadPng() {
    downloadHref(await qrPngDataUrl(url, DOWNLOAD_WIDTH), qrFileName(serialNumber, 'png'));
  }

  async function downloadSvg() {
    downloadText(await qrSvg(url), qrFileName(serialNumber, 'svg'), 'image/svg+xml');
  }

  return (
    <div className="grid gap-4">
      <div className="mx-auto grid w-full max-w-56 justify-items-center gap-2 rounded-control border border-line bg-white p-3">
        {preview ? (
          // Ảnh tạo từ data URL trong trình duyệt nên không qua bộ tối ưu ảnh của Next.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt={`Mã QR tra cứu hộ chiếu ${modelName}, serial ${serialNumber}`}
            className="aspect-square w-full"
          />
        ) : (
          <div aria-hidden className="aspect-square w-full animate-pulse rounded bg-canvas" />
        )}
        <p className="font-mono text-sm tracking-wider text-[#0a2a44]">
          {formatPublicCode(publicCode)}
        </p>
      </div>
      <p className="text-center text-sm break-all text-muted">{url}</p>
      {!registered ? (
        <p className="rounded-control bg-warn-tint px-3 py-2 text-sm text-warn">
          Trang hộ chiếu chỉ mở sau khi sản phẩm được ghi lên blockchain.
        </p>
      ) : null}
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => void downloadPng()}>
          <Download aria-hidden className="size-4" />
          Tải PNG
        </Button>
        <Button variant="secondary" size="sm" onClick={() => void downloadSvg()}>
          <Download aria-hidden className="size-4" />
          Tải SVG
        </Button>
        {registered ? (
          <ButtonLink href={`/products/labels?ids=${productId}`} variant="secondary" size="sm">
            <Printer aria-hidden className="size-4" />
            In tem
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}
