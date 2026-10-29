import jsQR from 'jsqr';

/** Ảnh lớn được thu nhỏ trước khi đọc: nhanh hơn mà mã QR trên tem vẫn đủ rõ. */
const MAX_DECODE_SIDE = 1600;

/** Đọc mã QR trong một khung ảnh; `null` nếu không thấy mã. */
export function decodeFrame(frame: ImageData): string | null {
  return (
    jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'attemptBoth' })?.data ?? null
  );
}

/** Vẽ nguồn ảnh (ảnh tải lên, khung hình camera) lên canvas rồi đọc mã QR. */
export function decodeSource(
  source: CanvasImageSource,
  width: number,
  height: number,
  canvas: HTMLCanvasElement = document.createElement('canvas'),
): string | null {
  const scale = Math.min(1, MAX_DECODE_SIDE / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return null;
  }
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return decodeFrame(context.getImageData(0, 0, canvas.width, canvas.height));
}

/** Đọc mã QR trong ảnh người dùng tải lên (ảnh chụp tem, ảnh PNG/SVG đã tải về). */
export async function decodeImageFile(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return decodeSource(image, image.naturalWidth || 1024, image.naturalHeight || 1024);
  } finally {
    URL.revokeObjectURL(url);
  }
}
