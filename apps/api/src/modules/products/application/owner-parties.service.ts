import { Injectable } from '@nestjs/common';
import { IdentityDirectory, type PartyActor } from '../../identity/index.js';
import { OrganizationDirectory, type OrganizationRef } from '../../organizations/index.js';

/** Các Party mà người dùng đứng tên sở hữu sản phẩm. */
export interface OwnerPartySet {
  actor: PartyActor | null;
  /** Tổ chức người dùng đại diện (mọi trạng thái); `null` nếu không có. */
  organization: OrganizationRef | null;
  /** UUID Party: cá nhân và tổ chức (D25: Party tổ chức dùng chung UUID với organizations). */
  partyIds: string[];
}

/**
 * M9: sản phẩm có thể thuộc tổ chức (chuyển nhượng cho doanh nghiệp). Người đại diện xem và thao
 * tác thay tổ chức, nên "sản phẩm của tôi" gồm sản phẩm của Party cá nhân và của tổ chức đó.
 */
@Injectable()
export class OwnerParties {
  constructor(
    private readonly identity: IdentityDirectory,
    private readonly organizations: OrganizationDirectory,
  ) {}

  async of(userId: string): Promise<OwnerPartySet> {
    const [actor, organization] = await Promise.all([
      this.identity.actorOf(userId),
      this.organizations.representedBy(userId),
    ]);
    const partyIds = [actor?.partyId, organization?.id].filter((id): id is string => !!id);
    return { actor, organization, partyIds };
  }
}
