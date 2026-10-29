import { passportPath } from '@dpp/shared';
import QRCode from 'qrcode';

/** Xanh đại dương đậm trên nền trắng: đủ tương phản để camera và máy quét đọc nhanh. */
const QR_OPTIONS = {
  errorCorrectionLevel: 'M',
  margin: 2,
  color: { dark: '#0a2a44', light: '#ffffff' },
} as const;

/** Đường dẫn trang hộ chiếu công khai mà mã QR trỏ tới. */
export function passportUrl(baseUrl: string, publicCode: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${passportPath(publicCode)}`;
}

export function qrPngDataUrl(url: string, width: number): Promise<string> {
  return QRCode.toDataURL(url, { ...QR_OPTIONS, width });
}

export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...QR_OPTIONS, type: 'svg' });
}

/** Tên file an toàn cho mọi hệ điều hành, theo serial sản phẩm. */
export function qrFileName(serialNumber: string, extension: 'png' | 'svg'): string {
  return `qr-${serialNumber.replace(/[^A-Za-z0-9._-]+/g, '_')}.${extension}`;
}

export function downloadHref(href: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  link.click();
}

export function downloadText(content: string, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  downloadHref(url, fileName);
  URL.revokeObjectURL(url);
}
