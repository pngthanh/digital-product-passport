import { formatPublicCode } from '@dpp/shared';
import { Printer } from 'lucide-react';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import type { RegisteredProduct } from './product-flows';

/** Các sản phẩm vừa ghi lên blockchain cùng một giao dịch, kèm lối tắt in tem cho cả lô. */
export function RegisteredBatch({ products }: { products: readonly RegisteredProduct[] }) {
  return (
    <div className="grid gap-4">
      <ul className="divide-y divide-line rounded-control border border-line">
        {products.map((product) => (
          <li
            key={product.id}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
          >
            <Link
              href={`/products/${product.id}`}
              className="font-mono text-[13px] font-medium text-tint-ink underline-offset-4 hover:underline"
            >
              {product.serialNumber}
            </Link>
            <span className="font-mono text-[13px] tracking-wider text-muted">
              {formatPublicCode(product.publicCode)}
            </span>
          </li>
        ))}
      </ul>
      <ButtonLink
        href={`/products/labels?ids=${products.map((product) => product.id).join(',')}`}
        className="justify-self-start"
      >
        <Printer aria-hidden className="size-4" />
        In tem QR cho {products.length === 1 ? 'sản phẩm này' : `${products.length} sản phẩm`}
      </ButtonLink>
    </div>
  );
}
