import { PRODUCT_BATCH_MAX_SIZE, type ProductInput } from '@dpp/shared';
import { type ProductField, productFormSchema } from './product.schema';

/** Cột của file CSV, theo đúng thứ tự trong file mẫu. */
export const PRODUCT_CSV_COLUMNS: readonly {
  field: ProductField;
  header: string;
  label: string;
  required: boolean;
}[] = [
  { field: 'serialNumber', header: 'serial_number', label: 'Serial', required: true },
  { field: 'modelName', header: 'model_name', label: 'Tên model', required: true },
  { field: 'description', header: 'description', label: 'Mô tả', required: false },
  { field: 'manufacturedOn', header: 'manufactured_on', label: 'Ngày sản xuất', required: true },
  { field: 'warrantyMonths', header: 'warranty_months', label: 'Bảo hành (tháng)', required: true },
];

/** Tên cột tiếng Việt (bỏ dấu) cũng được nhận, vì nhiều người lập file trong Excel. */
const HEADER_ALIASES: Readonly<Record<string, ProductField>> = {
  serial_number: 'serialNumber',
  serial: 'serialNumber',
  so_serial: 'serialNumber',
  model_name: 'modelName',
  model: 'modelName',
  ten_model: 'modelName',
  ten_san_pham: 'modelName',
  description: 'description',
  mo_ta: 'description',
  manufactured_on: 'manufacturedOn',
  ngay_san_xuat: 'manufacturedOn',
  warranty_months: 'warrantyMonths',
  bao_hanh_thang: 'warrantyMonths',
  bao_hanh: 'warrantyMonths',
};

export interface ProductCsvRow {
  /** Số dòng trong file (dòng tiêu đề là 1). */
  line: number;
  cells: Readonly<Record<ProductField, string>>;
  /** Có khi dòng hợp lệ. */
  input: ProductInput | null;
  issues: Partial<Record<ProductField, string>>;
}

export interface ProductCsvResult {
  rows: ProductCsvRow[];
  /** Lỗi của cả file (thiếu cột, quá nhiều dòng...). */
  errors: string[];
}

function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Tách bảng theo RFC 4180: ô có ngoặc kép, "" là một dấu ngoặc kép, xuống dòng CRLF hoặc LF. */
export function parseCsv(text: string, delimiter: ',' | ';'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ''));
}

/** Excel tiếng Việt thường lưu CSV với dấu chấm phẩy; đoán theo dòng tiêu đề. */
function detectDelimiter(firstLine: string): ',' | ';' {
  return (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
}

/** Đọc file CSV sản phẩm và kiểm tra từng dòng bằng đúng quy tắc của form đăng ký. */
export function readProductCsv(content: string): ProductCsvResult {
  const text = content.replace(/^﻿/, '');
  const [headerRow, ...dataRows] = parseCsv(text, detectDelimiter(text.split(/\r?\n/, 1)[0] ?? ''));
  if (!headerRow) {
    return { rows: [], errors: ['File trống. Dùng file mẫu để biết các cột cần có.'] };
  }
  const columnOf = new Map<ProductField, number>();
  headerRow.forEach((header, index) => {
    const field = HEADER_ALIASES[normalizeHeader(header)];
    if (field && !columnOf.has(field)) {
      columnOf.set(field, index);
    }
  });
  const missing = PRODUCT_CSV_COLUMNS.filter(
    (column) => column.required && !columnOf.has(column.field),
  );
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [`Thiếu cột: ${missing.map((column) => column.header).join(', ')}.`],
    };
  }
  const errors =
    dataRows.length === 0
      ? ['File chưa có dòng sản phẩm nào.']
      : dataRows.length > PRODUCT_BATCH_MAX_SIZE
        ? [
            `File có ${dataRows.length} dòng; mỗi lô tối đa ${PRODUCT_BATCH_MAX_SIZE} sản phẩm. Tách thành nhiều file.`,
          ]
        : [];

  const seen = new Map<string, number>();
  const rows = dataRows.map((cells, index): ProductCsvRow => {
    const values = Object.fromEntries(
      PRODUCT_CSV_COLUMNS.map((column) => [
        column.field,
        (cells[columnOf.get(column.field) ?? -1] ?? '').trim(),
      ]),
    ) as Record<ProductField, string>;
    const parsed = productFormSchema.safeParse(values);
    const issues: Partial<Record<ProductField, string>> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && !(field in issues)) {
          issues[field as ProductField] = issue.message;
        }
      }
    }
    const line = index + 2;
    if (parsed.success) {
      const firstLine = seen.get(parsed.data.serialNumber);
      if (firstLine !== undefined) {
        issues.serialNumber = `Trùng serial với dòng ${firstLine}`;
      } else {
        seen.set(parsed.data.serialNumber, line);
      }
    }
    return {
      line,
      cells: values,
      input: parsed.success && Object.keys(issues).length === 0 ? parsed.data : null,
      issues,
    };
  });
  return { rows, errors };
}

/** File mẫu (UTF-8 có BOM để Excel đọc đúng tiếng Việt). */
export function productCsvTemplate(): string {
  const lines = [
    PRODUCT_CSV_COLUMNS.map((column) => column.header).join(','),
    'LSV-2026-000001,Máy lọc không khí LSV Air 300,"Công suất 45 W, màng HEPA H13",2026-10-01,24',
    'LSV-2026-000002,Máy lọc không khí LSV Air 300,"Công suất 45 W, màng HEPA H13",2026-10-01,24',
    'LSV-2026-000003,Quạt tháp LSV Breeze T1,,15/10/2026,12',
  ];
  return `﻿${lines.join('\r\n')}\r\n`;
}
