// Public API của module organizations — module khác chỉ import từ đây.
export { OrganizationsModule } from './organizations.module.js';
export { OrganizationsWorkerModule } from './organizations-worker.module.js';
export {
  OrganizationDirectory,
  type OrganizationRef,
} from './application/organization-directory.service.js';
export {
  ORGANIZATION_STATISTICS,
  type OrganizationStatistics,
} from './application/ports/organization-statistics.reader.js';
