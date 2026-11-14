// Public API của module products — module khác chỉ import từ đây.
export { ProductsModule } from './products.module.js';
export { ProductsWorkerModule } from './products-worker.module.js';
export {
  ProductDirectory,
  type ProductRef,
  type WarrantyRef,
} from './application/product-directory.service.js';
export { OwnerParties, type OwnerPartySet } from './application/owner-parties.service.js';
export { maskEmail } from './application/prepare-product-sale.use-case.js';
export {
  PRODUCT_STATISTICS,
  type OwnershipBurst,
  type ProductStatistics,
  type ProductSummary,
} from './application/ports/product-statistics.reader.js';
