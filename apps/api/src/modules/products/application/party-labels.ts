import { Injectable } from '@nestjs/common';
import {
  type OrganizationLabel,
  type PartyLabel,
  partyIdFromUuid,
  uuidFromPartyId,
} from '@dpp/shared';
import { OrganizationDirectory, type OrganizationRef } from '../../organizations/index.js';

const ZERO_PARTY = `0x${'0'.repeat(64)}`;

/** UUID Party từ partyId (bytes32) trong event; `null` với bytes32(0) hoặc giá trị lạ. */
export function partyUuidOf(chainPartyId: string): string | null {
  if (chainPartyId.toLowerCase() === ZERO_PARTY) {
    return null;
  }
  try {
    return uuidFromPartyId(chainPartyId);
  } catch {
    return null;
  }
}

export function organizationLabel(organization: OrganizationRef): OrganizationLabel {
  return {
    organizationId: organization.id,
    name: organization.name,
    partyId: organization.partyId,
  };
}

/**
 * Nhãn hiển thị của các Party trong một màn hình. Party tổ chức dùng chung UUID với organizations
 * (D25) nên có tên; Party cá nhân không hiện tên (không lộ thông tin người mua), chỉ đánh dấu
 * "bạn" khi đó là người đang xem.
 */
export class PartyLabelMap {
  constructor(
    private readonly organizations: ReadonlyMap<string, OrganizationRef>,
    private readonly viewerPartyId: string | null,
  ) {}

  party(partyId: string | null): PartyLabel | null {
    if (!partyId) {
      return null;
    }
    const organization = this.organizations.get(partyId);
    return organization
      ? { kind: 'ORGANIZATION', organization: organizationLabel(organization) }
      : { kind: 'PERSON', isYou: partyId === this.viewerPartyId };
  }

  organization(partyId: string | null): OrganizationLabel | null {
    const organization = partyId ? this.organizations.get(partyId) : undefined;
    return organization ? organizationLabel(organization) : null;
  }

  /** Nhà phát hành luôn có trong organizations; tên rỗng chỉ khi dữ liệu bị sửa tay. */
  issuer(organizationId: string): OrganizationLabel {
    return (
      this.organization(organizationId) ?? {
        organizationId,
        name: '',
        partyId: partyIdFromUuid(organizationId),
      }
    );
  }

  /** Nhãn từ partyId (bytes32) trong event. */
  chainParty(chainPartyId: string | number | boolean | undefined): PartyLabel | null {
    return typeof chainPartyId === 'string' ? this.party(partyUuidOf(chainPartyId)) : null;
  }
}

@Injectable()
export class PartyLabels {
  constructor(private readonly organizations: OrganizationDirectory) {}

  async resolve(
    partyIds: readonly (string | null)[],
    viewerPartyId: string | null = null,
  ): Promise<PartyLabelMap> {
    const ids = partyIds.filter((id): id is string => id !== null);
    const organizations = ids.length > 0 ? await this.organizations.describe(ids) : new Map();
    return new PartyLabelMap(organizations, viewerPartyId);
  }
}
