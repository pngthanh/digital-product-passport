// Public API của module identity — module khác chỉ import từ đây.
export { IdentityModule } from './identity.module.js';
export { IdentityWorkerModule } from './identity-worker.module.js';
export { CurrentUser, SessionGuard } from './presentation/session.guard.js';
export { AdminGuard } from './presentation/admin.guard.js';
export {
  IdentityDirectory,
  type PartyActor,
  type PartySummary,
  type PersonSummary,
  type UserSummary,
} from './application/identity-directory.service.js';
export type { AuthenticatedUser } from './domain/user-account.js';
export {
  ReconcilePartyWallets,
  type ReconciliationSummary,
} from './application/reconcile-party-wallets.use-case.js';
export {
  IDENTITY_STATISTICS,
  type AccountStatistics,
  type IdentityStatistics,
} from './application/ports/identity-statistics.reader.js';
