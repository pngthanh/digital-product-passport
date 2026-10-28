// Public API của module audit — module khác chỉ import từ đây.
export { AuditModule } from './audit.module.js';
export { AuditTrail } from './application/audit-trail.service.js';
export { AuditAction, type AuditEntry } from './domain/audit-entry.js';
