// Public API của module products — module khác chỉ import từ đây.
export { ProductsModule } from './products.module.js';
export { ProductsWorkerModule } from './products-worker.module.js';
export {
  ProductDirectory,
  type ProductRef,
  type WarrantyRef,
} from './application/product-directory.service.js';
export { maskEmail } from './application/prepare-product-sale.use-case.js';
