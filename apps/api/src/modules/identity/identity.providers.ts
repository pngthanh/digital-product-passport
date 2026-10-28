import type { Provider } from '@nestjs/common';
import { CLOCK, SYSTEM_CLOCK } from '../../common/time/clock.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { ACCOUNT_REPOSITORY } from './application/ports/account.repository.js';
import { PASSWORD_HASHER } from './application/ports/password-hasher.port.js';
import { PARTY_REGISTRY_READER } from './application/ports/party-registry-reader.port.js';
import { PARTY_WALLET_REPOSITORY } from './application/ports/party-wallet.repository.js';
import { SESSION_TOKENS } from './application/ports/session-tokens.port.js';
import { WALLET_CHALLENGE_TOKENS } from './application/ports/wallet-challenge-tokens.port.js';
import { WALLET_LINK_AUTHORIZER } from './application/ports/wallet-link-authorizer.port.js';
import {
  WALLET_LINK_SETTINGS,
  type WalletLinkSettings,
} from './application/ports/wallet-link-settings.js';
import { Argon2PasswordHasher } from './infrastructure/argon2-password.hasher.js';
import { Eip712WalletLinkAuthorizer } from './infrastructure/eip712-wallet-link.authorizer.js';
import { EthersPartyRegistryReader } from './infrastructure/ethers-party-registry.reader.js';
import { JoseSessionTokens } from './infrastructure/jose-session.tokens.js';
import { JoseWalletChallengeTokens } from './infrastructure/jose-wallet-challenge.tokens.js';
import { PrismaAccountRepository } from './infrastructure/prisma-account.repository.js';
import { PrismaPartyWalletRepository } from './infrastructure/prisma-party-wallet.repository.js';

/** Giấy phép gắn ví có hiệu lực 15 phút: đủ để chuyển mạng, nạp MON và xác nhận trong MetaMask. */
export const WALLET_AUTHORIZATION_TTL_SECONDS = 15 * 60;

/** Nối cổng (port) của tầng application với hiện thực ở tầng infrastructure; dùng cho API và Worker. */
export const IDENTITY_PORT_PROVIDERS: Provider[] = [
  { provide: CLOCK, useValue: SYSTEM_CLOCK },
  { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
  { provide: SESSION_TOKENS, useClass: JoseSessionTokens },
  { provide: WALLET_CHALLENGE_TOKENS, useClass: JoseWalletChallengeTokens },
  { provide: ACCOUNT_REPOSITORY, useClass: PrismaAccountRepository },
  { provide: PARTY_WALLET_REPOSITORY, useClass: PrismaPartyWalletRepository },
  { provide: WALLET_LINK_AUTHORIZER, useClass: Eip712WalletLinkAuthorizer },
  { provide: PARTY_REGISTRY_READER, useClass: EthersPartyRegistryReader },
  {
    provide: WALLET_LINK_SETTINGS,
    inject: [AppConfigService],
    useFactory: (config: AppConfigService): WalletLinkSettings => {
      const web = new URL(config.webOrigin);
      return {
        siweDomain: web.host,
        siweUri: web.origin,
        chainId: config.chain.chainId,
        authorizationTtlSeconds: WALLET_AUTHORIZATION_TTL_SECONDS,
      };
    },
  },
];
