import type { AuthStatus, OrganizationProfile, OrganizationStage } from '@dpp/shared';
import type { TransactionScope } from '../../../../common/persistence/transaction-scope.js';
import type { OrganizationRecord } from '../../domain/organization.js';

export interface DraftInput extends OrganizationProfile {
  representativeUserId: string;
  profileHash: string;
}

/** Thay đổi trạng thái do event finalized của PartyRegistry ([P]). */
export type StatusProjection =
  | { status: 'PENDING'; at: Date; profileHash: string; orgType: OrganizationProfile['orgType'] }
  | { status: Exclude<AuthStatus, 'PENDING'>; at: Date };

/** Bảng organizations. */
export interface OrganizationRepository {
  findById(id: string): Promise<OrganizationRecord | null>;
  findByRepresentative(userId: string): Promise<OrganizationRecord | null>;
  findByTaxCode(taxCode: string): Promise<OrganizationRecord | null>;
  /** Mới nhất trước; `stages` rỗng là mọi đơn đã nộp (trừ bản nháp). */
  list(stages: readonly OrganizationStage[]): Promise<OrganizationRecord[]>;
  countByStage(): Promise<Record<OrganizationStage, number>>;
  /** Mã số thuế trùng ném TaxCodeTakenError. */
  createDraft(input: DraftInput, scope: TransactionScope): Promise<OrganizationRecord>;
  updateProfile(id: string, input: DraftInput): Promise<OrganizationRecord>;
  saveStatusReason(id: string, reason: string): Promise<void>;
  applyStatus(id: string, projection: StatusProjection, scope: TransactionScope): Promise<boolean>;
}

export const ORGANIZATION_REPOSITORY = Symbol('ORGANIZATION_REPOSITORY');
