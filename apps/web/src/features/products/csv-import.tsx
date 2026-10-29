'use client';

import { PRODUCT_BATCH_MAX_SIZE, type ProductInput } from '@dpp/shared';
import { Download, FileUp } from 'lucide-react';
import { type ChangeEvent, useRef, useState } from 'react';
import { Button, buttonClasses } from '@/components/ui/button';
import { StepList } from '@/components/ui/step-list';
import { ApiError } from '@/lib/api-error';
import { cn } from '@/lib/cn';
import { describeWalletError } from '@/lib/wallet/wallet-errors';
import { FormAlert } from '../auth/form-alert';
import {
  PRODUCT_CSV_COLUMNS,
  productCsvTemplate,
  type ProductCsvResult,
  readProductCsv,
} from './product-csv';
import {
  REGISTER_STEPS,
  type RegisteredProduct,
  type RegisterStep,
  registerProducts,
  registerStepLabels,
} from './product-flows';
import { RegisteredBatch } from './registered-batch';
import { SavedDraftsRetry } from './saved-drafts-retry';

function downloadTemplate() {
  const url = URL.createObjectURL(
    new Blob([productCsvTemplate()], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'mau-dang-ky-san-pham.csv';
  link.click();
  URL.revokeObjectURL(url);
}

/** PRD-02: đọc file CSV, kiểm tra từng dòng ngay trên trình duyệt, rồi ghi cả lô trong một giao dịch. */
export function CsvImport({ chainId }: { chainId: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ProductCsvResult | null>(null);
  const [step, setStep] = useState<RegisterStep | 'done' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<RegisteredProduct[] | null>(null);
  const [created, setCreated] = useState<RegisteredProduct[] | null>(null);
  const running = step !== null && step !== 'done';

  const valid = result?.rows.flatMap((row) => (row.input ? [row.input] : [])) ?? [];
  const invalidCount = (result?.rows.length ?? 0) - valid.length;
  const ready =
    result !== null && result.errors.length === 0 && invalidCount === 0 && valid.length > 0;

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError(null);
    setDrafts(null);
    setCreated(null);
    if (!file) {
      return;
    }
    setFileName(file.name);
    setResult(readProductCsv(await file.text()));
  }

  function finish(products: RegisteredProduct[]) {
    setStep('done');
    setCreated(products);
    setDrafts(null);
    setResult(null);
    setFileName(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  async function submit(items: ProductInput[]) {
    setError(null);
    setDrafts(null);
    let saved: RegisteredProduct[] | null = null;
    try {
      finish(
        await registerProducts(items, chainId, setStep, (created) => {
          saved = created;
        }),
      );
    } catch (failure) {
      setStep(null);
      if (failure instanceof ApiError && failure.code === 'SERIAL_TAKEN') {
        setError(`${failure.message} Bỏ các dòng đó khỏi file rồi chọn lại.`);
        return;
      }
      setError(describeWalletError(failure));
      setDrafts(saved);
    }
  }

  if (created) {
    return (
      <div className="grid gap-4">
        <p role="status" className="rounded-control bg-ok-tint px-3 py-2 text-sm text-ok">
          Đã ghi {created.length} sản phẩm lên blockchain trong một giao dịch.
        </p>
        <RegisteredBatch products={created} />
        <Button variant="secondary" className="justify-self-start" onClick={() => setCreated(null)}>
          Nhập file khác
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-2 text-sm text-muted">
        <p>
          Mỗi dòng là một sản phẩm, tối đa {PRODUCT_BATCH_MAX_SIZE} dòng mỗi file. Cả lô chỉ cần ký
          một lần trong MetaMask. Ngày sản xuất ghi YYYY-MM-DD hoặc DD/MM/YYYY.
        </p>
        <p>
          Cột:{' '}
          {PRODUCT_CSV_COLUMNS.map((column, index) => (
            <span key={column.header}>
              {index > 0 ? ', ' : ''}
              <code className="font-mono text-[13px] text-ink">{column.header}</code>
              {column.required ? '' : ' (không bắt buộc)'}
            </span>
          ))}
          .
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={downloadTemplate}>
          <Download aria-hidden className="size-4" />
          Tải file mẫu
        </Button>
        <label
          className={buttonClasses({
            className: cn(
              'cursor-pointer focus-within:ring-2 focus-within:ring-focus',
              running && 'pointer-events-none opacity-50',
            ),
          })}
        >
          <FileUp aria-hidden className="size-4" />
          {fileName ? 'Chọn file khác' : 'Chọn file CSV'}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={onFile}
            disabled={running}
          />
        </label>
      </div>

      {result ? (
        <div className="grid gap-3">
          <p className="text-sm">
            <span className="font-medium">{fileName}</span>: {result.rows.length} dòng,{' '}
            <span className="text-ok">{valid.length} hợp lệ</span>
            {invalidCount > 0 ? (
              <>
                , <span className="text-bad">{invalidCount} cần sửa</span>
              </>
            ) : null}
            .
          </p>
          {result.errors.map((message) => (
            <FormAlert key={message} message={message} />
          ))}
          {result.rows.length > 0 ? (
            <div className="overflow-x-auto rounded-control border border-line">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead className="bg-canvas text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                      Dòng
                    </th>
                    {PRODUCT_CSV_COLUMNS.map((column) => (
                      <th
                        key={column.field}
                        scope="col"
                        className="px-3 py-2 font-medium whitespace-nowrap"
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {result.rows.map((row) => (
                    <tr key={row.line} className={row.input ? undefined : 'bg-bad-tint/40'}>
                      <td className="px-3 py-2 align-top tabular-nums text-muted">{row.line}</td>
                      {PRODUCT_CSV_COLUMNS.map((column) => (
                        <td key={column.field} className="px-3 py-2 align-top">
                          <span
                            className={
                              column.field === 'serialNumber' ? 'font-mono text-[13px]' : undefined
                            }
                          >
                            {row.cells[column.field] || <span className="text-muted">—</span>}
                          </span>
                          {row.issues[column.field] ? (
                            <span className="mt-0.5 block text-xs text-bad">
                              {row.issues[column.field]}
                            </span>
                          ) : null}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {invalidCount > 0 ? (
            <p className="text-sm text-muted">Sửa các dòng tô đỏ trong file rồi chọn lại file.</p>
          ) : null}
        </div>
      ) : null}

      {step && step !== 'done' ? (
        <StepList
          label="Tiến trình ghi lô sản phẩm"
          steps={REGISTER_STEPS}
          current={step}
          labels={registerStepLabels(valid.length)}
        />
      ) : null}
      <FormAlert message={error} />

      {drafts ? (
        <SavedDraftsRetry drafts={drafts} chainId={chainId} onRegistered={finish} />
      ) : result && result.rows.length > 0 ? (
        <Button
          className="justify-self-start"
          disabled={!ready || running}
          onClick={() => void submit(valid)}
        >
          {running ? 'Đang xử lý…' : `Ghi ${result.rows.length} sản phẩm lên blockchain`}
        </Button>
      ) : null}
    </div>
  );
}
