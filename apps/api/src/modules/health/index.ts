// Public API của module health — module khác chỉ import từ đây.
export { HealthModule } from './health.module.js';
export { HealthService } from './application/health.service.js';
export type { HealthIndicator } from './application/health-indicator.port.js';
