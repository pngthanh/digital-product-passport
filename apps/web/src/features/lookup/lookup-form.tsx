'use client';

import { extractPublicCode } from '@dpp/shared';
import { Camera, CameraOff, ImageUp, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import { Button, buttonClasses } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { FormAlert } from '../auth/form-alert';
import { CODE_FORMAT_HINT } from './code-format-hint';
import { decodeImageFile, decodeSource } from './qr-decoder';

/** Thời gian giữa hai lần đọc khung hình camera. */
const SCAN_INTERVAL_MS = 200;

function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Trình duyệt chưa được phép dùng camera. Cho phép camera cho trang này rồi thử lại, hoặc tải ảnh mã QR lên.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Không tìm thấy camera trên thiết bị này. Tải ảnh mã QR lên thay thế.';
  }
  if (name === 'NotReadableError') {
    return 'Camera đang được ứng dụng khác dùng. Đóng ứng dụng đó rồi thử lại.';
  }
  return 'Không mở được camera. Tải ảnh mã QR lên thay thế.';
}

/**
 * Tra cứu hộ chiếu: gõ mã trên tem, quét bằng camera, hoặc tải ảnh có mã QR.
 * Mã QR của hệ thống là đường dẫn `.../p/<mã>`; mã trần cũng nhận. Ô nhập vẫn chạy khi trang chưa
 * tải xong JavaScript: form gửi `?code=` và trang Tra cứu chuyển hướng phía server.
 */
export function LookupForm({
  initialCode,
  initialError,
}: {
  initialCode?: string;
  initialError?: string;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | undefined>(initialError);
  const [reading, setReading] = useState(false);

  function stopCamera() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }

  useEffect(() => stopCamera, []);

  /** Nội dung đọc được từ mã QR hoặc ô nhập: đúng mã thì mở hộ chiếu. */
  function open(content: string): boolean {
    const code = extractPublicCode(content);
    if (!code) {
      return false;
    }
    stopCamera();
    router.push(`/p/${code}`);
    return true;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('code');
    setMessage(null);
    if (typeof value !== 'string' || !open(value)) {
      setInputError(CODE_FORMAT_HINT);
    }
  }

  async function startCamera() {
    setMessage(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setMessage(
        'Trình duyệt chỉ cho dùng camera trên trang HTTPS hoặc localhost. Tải ảnh mã QR lên thay thế.',
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setScanning(true);
      const video = videoRef.current;
      if (!video) {
        stopCamera();
        return;
      }
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement('canvas');
      timerRef.current = window.setInterval(() => {
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          return;
        }
        const content = decodeSource(video, video.videoWidth, video.videoHeight, canvas);
        if (content && !open(content)) {
          setMessage('Mã QR này không phải mã tra cứu của hệ thống Hộ chiếu số.');
        }
      }, SCAN_INTERVAL_MS);
    } catch (error) {
      stopCamera();
      setMessage(cameraErrorMessage(error));
    }
  }

  async function onImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setMessage(null);
    setReading(true);
    try {
      const content = await decodeImageFile(file);
      if (!content) {
        setMessage('Không thấy mã QR trong ảnh. Chụp gần hơn, đủ sáng và để cả mã nằm trong ảnh.');
      } else if (!open(content)) {
        setMessage('Mã QR này không phải mã tra cứu của hệ thống Hộ chiếu số.');
      }
    } catch {
      setMessage('Không đọc được ảnh này. Thử ảnh PNG hoặc JPG khác.');
    } finally {
      setReading(false);
    }
  }

  return (
    <div className="grid gap-6">
      <form action="/lookup" onSubmit={onSubmit} noValidate className="grid gap-3">
        <Field label="Mã trên tem" error={inputError}>
          {(props) => (
            <div className="flex gap-2">
              <Input
                {...props}
                name="code"
                defaultValue={initialCode}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="K7M2-PQ9X-RT4W"
                className="font-mono tracking-wider uppercase"
                onChange={() => setInputError(undefined)}
              />
              <Button type="submit" className="shrink-0">
                <Search aria-hidden className="size-4" />
                Tra cứu
              </Button>
            </div>
          )}
        </Field>
      </form>

      <div className="grid gap-3">
        <p className="text-sm font-medium">Hoặc dùng mã QR</p>
        <div className="flex flex-wrap gap-2">
          {scanning ? (
            <Button variant="secondary" onClick={stopCamera}>
              <CameraOff aria-hidden className="size-4" />
              Dừng quét
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => void startCamera()}>
              <Camera aria-hidden className="size-4" />
              Quét bằng camera
            </Button>
          )}
          <label
            className={buttonClasses({
              variant: 'secondary',
              className: cn(
                'cursor-pointer focus-within:ring-2 focus-within:ring-focus',
                reading && 'pointer-events-none opacity-50',
              ),
            })}
          >
            <ImageUp aria-hidden className="size-4" />
            {reading ? 'Đang đọc ảnh…' : 'Tải ảnh có mã QR'}
            <input type="file" accept="image/*" className="sr-only" onChange={onImage} />
          </label>
        </div>
        <div
          className={cn(
            'relative overflow-hidden rounded-control border border-line bg-ink/90',
            !scanning && 'hidden',
          )}
        >
          <video ref={videoRef} muted playsInline className="aspect-[4/3] w-full object-cover" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 m-auto size-48 rounded-lg border-2 border-white/80"
          />
          <p className="absolute inset-x-0 bottom-0 bg-black/50 px-3 py-2 text-center text-sm text-white">
            Đưa mã QR trên tem vào giữa khung
          </p>
        </div>
        <FormAlert message={message} />
      </div>
    </div>
  );
}
