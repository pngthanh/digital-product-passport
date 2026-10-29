'use client';

import { Tabs } from '@/components/ui/tabs';
import { CsvImport } from './csv-import';
import { ProductForm } from './product-form';

const TABS = [
  { id: 'single', label: 'Từng sản phẩm' },
  { id: 'csv', label: 'Nhập từ file CSV' },
] as const;

/** PRD-01 (từng sản phẩm) và PRD-02 (cả lô từ CSV) trên cùng một trang. */
export function RegisterTabs({ chainId }: { chainId: number }) {
  return (
    <Tabs label="Cách đăng ký sản phẩm" items={TABS}>
      {(active) => (
        <div className="mt-5">
          {active === 'single' ? (
            <ProductForm chainId={chainId} />
          ) : (
            <CsvImport chainId={chainId} />
          )}
        </div>
      )}
    </Tabs>
  );
}
