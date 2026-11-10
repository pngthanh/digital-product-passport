import { Injectable } from '@nestjs/common';
import { partyIdFromUuid, type TransferParty } from '@dpp/shared';
import { IdentityDirectory } from '../../identity/index.js';
import { OrganizationDirectory } from '../../organizations/index.js';
import { isTaxCode } from '../domain/transfer-request.js';
import { TransferRecipientNotFoundError } from '../domain/transfer.errors.js';
import { TransferParties } from './transfer-parties.js';

export interface ResolvedRecipient {
  /** UUID Party của bên nhận. */
  partyUuid: string;
  /** partyId (bytes32) on-chain. */
  chainPartyId: string;
  party: TransferParty;
  needsWallet: boolean;
}

/**
 * Bên nhận theo nội dung người gửi nhập: mã số thuế thì là doanh nghiệp đã duyệt, còn lại là email
 * tài khoản cá nhân (giống DST-03). Giấy phép của registrar chỉ cấp cho bên nhận tìm được ở đây.
 */
@Injectable()
export class RecipientResolver {
  constructor(
    private readonly identity: IdentityDirectory,
    private readonly organizations: OrganizationDirectory,
    private readonly parties: TransferParties,
  ) {}

  async resolve(recipient: string): Promise<ResolvedRecipient> {
    const value = recipient.trim();
    if (isTaxCode(value)) {
      const organization = await this.organizations.findByTaxCode(value);
      if (organization?.authStatus !== 'AUTHORIZED') {
        throw new TransferRecipientNotFoundError();
      }
      return {
        partyUuid: organization.id,
        chainPartyId: organization.partyId,
        party: await this.parties.one(organization.id),
        needsWallet: false,
      };
    }
    const person = await this.identity.findPersonByEmail(value);
    if (!person) {
      throw new TransferRecipientNotFoundError();
    }
    const actor = await this.identity.actorOf(person.userId);
    return {
      partyUuid: person.partyId,
      chainPartyId: partyIdFromUuid(person.partyId),
      party: await this.parties.one(person.partyId),
      needsWallet: !actor?.activeWallet,
    };
  }
}
