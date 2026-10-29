import { Inject, Injectable } from '@nestjs/common';
import { type AuthStatus, type OrgType, partyIdFromUuid } from '@dpp/shared';
import type { OrganizationRecord } from '../domain/organization.js';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from './ports/organization.repository.js';

/** Thông tin tổ chức module khác được đọc. */
export interface OrganizationRef {
  id: string;
  name: string;
  taxCode: string;
  orgType: OrgType;
  authStatus: AuthStatus;
  /** partyId (bytes32) on-chain; Party tổ chức dùng chung UUID với dòng organizations (D25). */
  partyId: string;
}

function toRef(record: OrganizationRecord): OrganizationRef {
  return {
    id: record.id,
    name: record.name,
    taxCode: record.taxCode,
    orgType: record.orgType,
    authStatus: record.authStatus,
    partyId: partyIdFromUuid(record.id),
  };
}

/** Public API của organizations cho module khác (sản phẩm, phân phối...). */
@Injectable()
export class OrganizationDirectory {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizations: OrganizationRepository,
  ) {}

  /** Tổ chức mà người dùng đang đại diện (mọi trạng thái); `null` nếu chưa có. */
  async representedBy(userId: string): Promise<OrganizationRef | null> {
    const record = await this.organizations.findByRepresentative(userId);
    return record && toRef(record);
  }

  async describe(ids: readonly string[]): Promise<Map<string, OrganizationRef>> {
    const records = await this.organizations.findManyByIds([...new Set(ids)]);
    return new Map(records.map((record) => [record.id, toRef(record)]));
  }
}
