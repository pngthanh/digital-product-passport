import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import type { WalletLinkAuthorization, WalletLinkChallenge, WalletSummary } from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { Client } from '../../../common/http/client-context.js';
import { ZodValidationPipe } from '../../../common/http/zod-validation.pipe.js';
import { AuthorizeWalletLink } from '../application/authorize-wallet-link.use-case.js';
import { IssueWalletChallenge } from '../application/issue-wallet-challenge.use-case.js';
import { RecordWalletLinkTransaction } from '../application/record-wallet-link-transaction.use-case.js';
import type { AuthenticatedUser } from '../domain/user-account.js';
import { presentWallet } from './identity.presenter.js';
import {
  type WalletAuthorizationBody,
  walletAuthorizationSchema,
  type WalletChallengeBody,
  walletChallengeSchema,
  walletIdSchema,
  type WalletTransactionBody,
  walletTransactionSchema,
} from './identity.schemas.js';
import { CurrentUser, SessionGuard } from './session.guard.js';

/** ACC-03 (liên kết MetaMask) và ACC-04 (xoay ví cá nhân): ba bước ký, cấp phép, báo giao dịch. */
@Controller('me/wallet-links')
@UseGuards(SessionGuard)
export class WalletLinksController {
  constructor(
    private readonly issueChallenge: IssueWalletChallenge,
    private readonly authorizeWalletLink: AuthorizeWalletLink,
    private readonly recordTransaction: RecordWalletLinkTransaction,
  ) {}

  @Post('challenge')
  @HttpCode(201)
  challenge(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(walletChallengeSchema)) body: WalletChallengeBody,
  ): Promise<WalletLinkChallenge> {
    return this.issueChallenge.execute(user, body);
  }

  @Post('authorize')
  @HttpCode(201)
  authorize(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(walletAuthorizationSchema)) body: WalletAuthorizationBody,
    @Client() client: ClientContext,
  ): Promise<WalletLinkAuthorization> {
    return this.authorizeWalletLink.execute(user, body, client);
  }

  @Post(':walletId/transaction')
  @HttpCode(202)
  async transaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('walletId', new ZodValidationPipe(walletIdSchema)) walletId: string,
    @Body(new ZodValidationPipe(walletTransactionSchema)) body: WalletTransactionBody,
    @Client() client: ClientContext,
  ): Promise<WalletSummary> {
    return presentWallet(await this.recordTransaction.execute(user, walletId, body.txHash, client));
  }
}
