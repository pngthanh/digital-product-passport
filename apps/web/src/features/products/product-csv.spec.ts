import { describe, expect, it } from 'vitest';
import { parseCsv, productCsvTemplate, readProductCsv } from './product-csv';

describe('Đọc file CSV sản phẩm', () => {
  it('đọc file mẫu: ngày DD/MM/YYYY đưa về YYYY-MM-DD, serial in hoa, ô có dấu phẩy trong ngoặc kép', () => {
    const { rows, errors } = readProductCsv(productCsvTemplate());

    expect(errors).toEqual([]);
    expect(rows.map((row) => row.input)).toEqual([
      {
        serialNumber: 'LSV-2026-000001',
        modelName: 'Máy lọc không khí LSV Air 300',
        description: 'Công suất 45 W, màng HEPA H13',
        manufacturedOn: '2026-10-01',
        warrantyMonths: 24,
      },
      expect.objectContaining({ serialNumber: 'LSV-2026-000002' }),
      expect.objectContaining({
        serialNumber: 'LSV-2026-000003',
        description: null,
        manufacturedOn: '2026-10-15',
        warrantyMonths: 12,
      }),
    ]);
  });

  it('nhận tiêu đề tiếng Việt và dấu chấm phẩy (Excel lưu CSV theo vùng Việt Nam)', () => {
    const { rows, errors } = readProductCsv(
      'Số serial;Tên model;Ngày sản xuất;Bảo hành (tháng)\nabc-1;Laptop A;01/10/2026;24\n',
    );

    expect(errors).toEqual([]);
    expect(rows[0]?.input).toMatchObject({ serialNumber: 'ABC-1', warrantyMonths: 24 });
  });

  it('báo lỗi theo từng dòng: thiếu tên, ngày sai, serial có khoảng trắng, serial trùng', () => {
    const { rows } = readProductCsv(
      [
        'serial_number,model_name,manufactured_on,warranty_months',
        'A-1,,2026-10-01,24',
        'A-2,Laptop,31/02/2026,24',
        'A 3,Laptop,2026-10-01,24',
        'A-4,Laptop,2026-10-01,abc',
        'A-5,Laptop,2026-10-01,12',
        'a-5,Laptop,2026-10-01,12',
      ].join('\n'),
    );

    expect(rows.map((row) => [row.line, Object.keys(row.issues)])).toEqual([
      [2, ['modelName']],
      [3, ['manufacturedOn']],
      [4, ['serialNumber']],
      [5, ['warrantyMonths']],
      [6, []],
      [7, ['serialNumber']],
    ]);
    expect(rows[5]?.issues.serialNumber).toBe('Trùng serial với dòng 6');
    expect(rows.filter((row) => row.input !== null)).toHaveLength(1);
  });

  it('thiếu cột bắt buộc, file trống hoặc quá 50 dòng thì báo lỗi của cả file', () => {
    expect(readProductCsv('serial_number,model_name\nA-1,Laptop').errors[0]).toContain(
      'manufactured_on',
    );
    expect(readProductCsv('').errors).toHaveLength(1);
    const many = ['serial_number,model_name,manufactured_on,warranty_months'];
    for (let index = 0; index < 51; index += 1) {
      many.push(`S-${index},Laptop,2026-10-01,12`);
    }
    expect(readProductCsv(many.join('\n')).errors[0]).toContain('tối đa 50');
  });

  it('tách ô đúng chuẩn RFC 4180, kể cả xuống dòng và ngoặc kép trong ô', () => {
    expect(parseCsv('a,"b ""c""",d\r\n"x\ny",z\n', ',')).toEqual([
      ['a', 'b "c"', 'd'],
      ['x\ny', 'z'],
    ]);
  });
});
