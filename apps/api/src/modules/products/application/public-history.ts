import { Injectable } from '@nestjs/common';
import type { ChainEventView } from '@dpp/shared';
import { IdentityDirectory } from '../../identity/index.js';
import { OrganizationDirectory } from '../../organizations/index.js';
import { partyUuidOf } from './party-labels.js';

/** Tham số event mang partyId (bytes32) của một bên. */
const PARTY_ARG_NAMES = [
  'issuerId',
  'fromPartyId',
  'toPartyId',
  'activatedBy',
  'serviceCenterId',
  'inspectorId',
  'ownerId',
  'requesterId',
] as const;

const ZERO_PARTY = `0x${'0'.repeat(64)}`;

function isPartyArg(name: string): boolean {
  return (PARTY_ARG_NAMES as readonly string[]).includes(name);
}

/** UUID tổ chức của mọi tham số bên trong một event (bỏ qua bên không phải tổ chức). */
function organizationsIn(event: ChainEventView, organizations: ReadonlySet<string>): string[] {
  return PARTY_ARG_NAMES.flatMap((name) => {
    const value = event.args[name];
    const uuid = typeof value === 'string' ? partyUuidOf(value) : null;
    return uuid && organizations.has(uuid) ? [uuid] : [];
  });
}

/**
 * (M11, D85) Lịch sử event trên hộ chiếu công khai không lộ người dùng cá nhân:
 * - bỏ partyId (bytes32) không phải của tổ chức khỏi `args`;
 * - giữ ví gửi chỉ khi người gửi đang là người đại diện của một doanh nghiệp có tên trong cùng giao
 *   dịch (tức là ký thay doanh nghiệp); còn lại để `null`.
 * Dữ liệu gốc vẫn công khai trên blockchain; API chỉ không gom sẵn danh tính cá nhân theo sản phẩm.
 */
@Injectable()
export class PublicHistory {
  constructor(
    private readonly identity: IdentityDirectory,
    private readonly organizations: OrganizationDirectory,
  ) {}

  async present(events: readonly ChainEventView[]): Promise<ChainEventView[]> {
    const partyIds = events.flatMap((event) =>
      PARTY_ARG_NAMES.flatMap((name) => {
        const value = event.args[name];
        const uuid = typeof value === 'string' ? partyUuidOf(value) : null;
        return uuid ? [uuid] : [];
      }),
    );
    const organizations = new Set((await this.organizations.describe(partyIds)).keys());

    const organizationsByTx = new Map<string, Set<string>>();
    for (const event of events) {
      const set = organizationsByTx.get(event.txHash) ?? new Set<string>();
      for (const id of organizationsIn(event, organizations)) {
        set.add(id);
      }
      organizationsByTx.set(event.txHash, set);
    }

    const actingFor = await this.representedOrganizations(
      events.flatMap((event) => (event.actorAddress ? [event.actorAddress] : [])),
    );

    return events.map((event) => {
      const actor = event.actorAddress?.toLowerCase() ?? null;
      const organization = actor ? actingFor.get(actor) : undefined;
      const signedForOrganization =
        organization !== undefined &&
        (organizationsByTx.get(event.txHash)?.has(organization) ?? false);
      return {
        ...event,
        actorAddress: signedForOrganization ? event.actorAddress : null,
        args: Object.fromEntries(
          Object.entries(event.args).filter(([name, value]) => keepArg(name, value, organizations)),
        ),
      };
    });
  }

  /** Ví (chữ thường) → UUID doanh nghiệp mà chủ ví đang đại diện. */
  private async representedOrganizations(
    addresses: readonly string[],
  ): Promise<Map<string, string>> {
    const users = await this.identity.usersOfWallets(addresses);
    const organizationOf = new Map<string, string | null>();
    for (const userId of new Set(users.values())) {
      organizationOf.set(userId, (await this.organizations.representedBy(userId))?.id ?? null);
    }
    const result = new Map<string, string>();
    for (const [address, userId] of users) {
      const organization = organizationOf.get(userId);
      if (organization) {
        result.set(address, organization);
      }
    }
    return result;
  }
}

function keepArg(
  name: string,
  value: ChainEventView['args'][string],
  organizations: ReadonlySet<string>,
): boolean {
  if (!isPartyArg(name) || typeof value !== 'string' || value.toLowerCase() === ZERO_PARTY) {
    return true;
  }
  const uuid = partyUuidOf(value);
  return uuid !== null && organizations.has(uuid);
}
