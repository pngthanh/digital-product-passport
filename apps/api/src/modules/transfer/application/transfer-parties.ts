import { Injectable } from '@nestjs/common';
import type { TransferParty } from '@dpp/shared';
import { IdentityDirectory } from '../../identity/index.js';
import { OrganizationDirectory } from '../../organizations/index.js';
import { maskEmail } from '../../products/index.js';

/**
 * Nhãn của bên gửi, bên nhận cho người trong cuộc: cá nhân hiện họ tên và email đã che, tổ chức hiện
 * tên và mã số thuế. `viewer` là các Party của người đang xem, để đánh dấu "bạn".
 */
@Injectable()
export class TransferParties {
  constructor(
    private readonly identity: IdentityDirectory,
    private readonly organizations: OrganizationDirectory,
  ) {}

  async describe(
    partyIds: readonly string[],
    viewer: readonly string[] = [],
  ): Promise<Map<string, TransferParty>> {
    const parties = await this.identity.describeParties(partyIds);
    const userIds = [...parties.values()].flatMap((party) => (party.userId ? [party.userId] : []));
    const orgIds = [...parties.values()]
      .filter((party) => party.kind === 'ORGANIZATION')
      .map((party) => party.partyId);
    const [users, organizations] = await Promise.all([
      this.identity.describeUsers(userIds),
      this.organizations.describe(orgIds),
    ]);
    const labels = new Map<string, TransferParty>();
    for (const party of parties.values()) {
      const isYou = viewer.includes(party.partyId);
      const organization = organizations.get(party.partyId);
      const user = party.userId ? users.get(party.userId) : undefined;
      if (organization) {
        labels.set(party.partyId, {
          kind: 'ORGANIZATION',
          organizationId: organization.id,
          name: organization.name,
          taxCode: organization.taxCode,
          isYou,
        });
      } else {
        labels.set(party.partyId, {
          kind: 'PERSON',
          fullName: user?.fullName ?? '',
          maskedEmail: user ? maskEmail(user.email) : '',
          isYou,
        });
      }
    }
    return labels;
  }

  /** Nhãn của một Party (đã chắc chắn có trong CSDL). */
  async one(partyId: string, viewer: readonly string[] = []): Promise<TransferParty> {
    const label = (await this.describe([partyId], viewer)).get(partyId);
    return label ?? { kind: 'PERSON', fullName: '', maskedEmail: '', isYou: false };
  }
}
