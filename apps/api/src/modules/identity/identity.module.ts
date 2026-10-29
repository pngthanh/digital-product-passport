import { Module } from '@nestjs/common';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AuditModule } from '../audit/index.js';
import { ChainSyncModule } from '../chain-sync/index.js';
import { AuthorizeWalletLink } from './application/authorize-wallet-link.use-case.js';
import { GetIdentity } from './application/get-identity.query.js';
import { IdentityDirectory } from './application/identity-directory.service.js';
import { IssueWalletChallenge } from './application/issue-wallet-challenge.use-case.js';
import { RecordWalletLinkTransaction } from './application/record-wallet-link-transaction.use-case.js';
import { RegisterAccount } from './application/register-account.use-case.js';
import { ResolveSession } from './application/resolve-session.use-case.js';
import { SignIn } from './application/sign-in.use-case.js';
import { SignOut } from './application/sign-out.use-case.js';
import { IDENTITY_PORT_PROVIDERS } from './identity.providers.js';
import { AdminGuard } from './presentation/admin.guard.js';
import { AuthController } from './presentation/auth.controller.js';
import { SessionGuard } from './presentation/session.guard.js';
import { WalletLinksController } from './presentation/wallet-links.controller.js';

/** M2 Identity & Auth (tiến trình API): ACC-01..04; IdentityDirectory cho module khác. */
@Module({
  imports: [DatabaseModule, BlockchainModule, AuditModule, ChainSyncModule],
  controllers: [AuthController, WalletLinksController],
  providers: [
    ...IDENTITY_PORT_PROVIDERS,
    RegisterAccount,
    SignIn,
    SignOut,
    ResolveSession,
    GetIdentity,
    IssueWalletChallenge,
    AuthorizeWalletLink,
    RecordWalletLinkTransaction,
    IdentityDirectory,
    SessionGuard,
    AdminGuard,
  ],
  exports: [SessionGuard, AdminGuard, ResolveSession, IdentityDirectory],
})
export class IdentityModule {}
