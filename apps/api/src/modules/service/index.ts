// Public API của module service — module khác chỉ import từ đây.
export { ServiceModule } from './service.module.js';
export { ServiceWorkerModule } from './service-worker.module.js';
export { ServiceOwnerChange } from './application/service-owner-change.js';
export {
  SERVICE_STATISTICS,
  type OverdueServiceItem,
  type ServiceStatistics,
  type ServiceSummary,
} from './application/ports/service-statistics.reader.js';
