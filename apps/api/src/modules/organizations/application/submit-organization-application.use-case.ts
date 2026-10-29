import { Inject, Injectable } from '@nestjs/common';
import {
  type OrganizationApplication,
  type OrganizationApplicationAuthorization,
  type OrganizationApplicationInput,
  organizationProfileHash,
  ORG_TYPE_ROLE,
  partyIdFromUuid,
  toChecksumAddress,
} from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../common/persistence/transaction-scope.js';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import { AuditAction, AuditTrail } from '../../audit/index.js';
import { type AuthenticatedUser, IdentityDirectory } from '../../identity/index.js';
import { canEditApplication, normalizeProfile, stageOf } from '../domain/organization.js';
import {
  ApplicationLockedError,
  ChainReadFailedError,
  OrganizationChainNotConfiguredError,
  PersonalWalletRequiredError,
  TaxCodeTakenError,
} from '../domain/organizations.errors.js';
import { ORGANIZATION_CHAIN, type OrganizationChain } from './ports/organization-chain.port.js';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from './ports/organization.repository.js';

/** Giấy phép nộp đơn có hiệu lực 15 phút: đủ để kiểm tra số dư và xác nhận trong MetaMask. */
export const APPLICATION_AUTHORIZATION_TTL_SECONDS = 15 * 60;

/**
 * ORG-01 bước 1: lưu hồ sơ (bản nháp hoặc sửa đơn bị từ chối) rồi cấp giấy phép EIP-712.
 * Ví cá nhân của người đại diện tự gửi applyOrganization kèm phí; Indexer ghi nhận khi finalized.
 */
@Injectable()
export class SubmitOrganizationApplication {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizations: OrganizationRepository,
    @Inject(ORGANIZATION_CHAIN) private readonly chain: OrganizationChain,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly identity: IdentityDirectory,
    private readonly audit: AuditTrail,
  ) {}

  async execute(
    user: AuthenticatedUser,
    input: OrganizationApplicationInput,
    client: ClientContext,
  ): Promise<OrganizationApplicationAuthorization> {
    const contractAddress = this.chain.contractAddress;
    if (!contractAddress) {
      throw new OrganizationChainNotConfiguredError();
    }
    const actor = await this.identity.actorOf(user.id);
    if (!actor?.activeWallet || !actor.chainPartyId) {
      throw new PersonalWalletRequiredError();
    }
    const wallet = actor.activeWallet;
    const representativeId = actor.chainPartyId;

    const profile = normalizeProfile(input);
    const existing = await this.organizations.findByRepresentative(user.id);
    if (existing && !canEditApplication(stageOf(existing))) {
      throw new ApplicationLockedError(stageOf(existing));
    }
    const sameTaxCode = await this.organizations.findByTaxCode(profile.taxCode);
    if (sameTaxCode && sameTaxCode.id !== existing?.id) {
      throw new TaxCodeTakenError();
    }

    const profileHash = organizationProfileHash(profile);
    const draft = { ...profile, representativeUserId: user.id, profileHash };
    const organization = existing
      ? await this.organizations.updateProfile(existing.id, draft)
      : await this.unitOfWork.run(async (scope) => {
          const created = await this.organizations.createDraft(draft, scope);
          await this.identity.createOrganizationParty(created.id, scope);
          return created;
        });

    let fee: bigint;
    try {
      fee = await this.chain.registrationFee();
    } catch {
      throw new ChainReadFailedError();
    }
    const application: OrganizationApplication = {
      partyId: partyIdFromUuid(organization.id),
      representativeId,
      role: ORG_TYPE_ROLE[profile.orgType],
      profileHash,
      deadline: BigInt(
        Math.floor(this.clock.now().getTime() / 1000) + APPLICATION_AUTHORIZATION_TTL_SECONDS,
      ),
    };
    const signature = await this.chain.signApplication(application);

    await this.audit.record({
      action: AuditAction.ORG_APPLICATION_AUTHORIZED,
      actorUserId: user.id,
      targetType: 'organization',
      targetId: organization.id,
      metadata: { taxCode: profile.taxCode, orgType: profile.orgType, profileHash },
      client,
    });

    return {
      organizationId: organization.id,
      method: 'applyOrganization',
      chainId: this.chain.chainId,
      contractAddress: toChecksumAddress(contractAddress),
      partyId: application.partyId,
      representativeId,
      role: application.role,
      profileHash,
      wallet: toChecksumAddress(wallet),
      feeWei: fee.toString(),
      deadline: application.deadline.toString(),
      signature,
    };
  }
}
