import { Inject, Injectable } from '@nestjs/common';
import type {
  AlertDecision,
  AlertParty,
  AlertStatusCode,
  AlertSummary,
  AnomalyAlertPage,
  AnomalyAlertView,
  AnomalySeverityLevel,
  AuditActor,
  AuditLogPage,
  AuditLogView,
} from '@dpp/shared';
import {
  type AnomalyAlertRecord,
  AuditRecords,
  type AuditLogFilter,
  type AuditLogRecord,
} from '../../audit/index.js';
import { IdentityDirectory } from '../../identity/index.js';
import { OrganizationDirectory } from '../../organizations/index.js';
import { ProductDirectory } from '../../products/index.js';
import { MonitoringAlertNotFoundError } from '../domain/monitoring.errors.js';

export const AUDIT_PAGE_SIZE = 50;
export const ALERT_PAGE_SIZE = 30;

function isDecision(value: unknown): value is AlertDecision {
  return value === 'ACKNOWLEDGED' || value === 'DISMISSED';
}

/** Bộ lọc nhật ký từ màn hình Admin; email người thực hiện được đổi sang userId. */
export interface AuditLogQuery extends Omit<AuditLogFilter, 'actorUserId'> {
  actorEmail?: string;
}

/** Tên, email người dùng theo id (Admin xem được). */
async function actorsOf(
  identity: Pick<IdentityDirectory, 'describeUsers'>,
  userIds: readonly (string | null)[],
): Promise<Map<string, AuditActor>> {
  const ids = [...new Set(userIds.filter((id) => id !== null))];
  const users = ids.length > 0 ? await identity.describeUsers(ids) : new Map();
  return new Map(
    [...users.values()].map((user) => [
      user.userId,
      { userId: user.userId, fullName: user.fullName, email: user.email },
    ]),
  );
}

function presentLog(record: AuditLogRecord, actors: ReadonlyMap<string, AuditActor>): AuditLogView {
  return {
    id: record.id,
    action: record.action,
    actor: record.actorUserId ? (actors.get(record.actorUserId) ?? null) : null,
    targetType: record.targetType,
    targetId: record.targetId,
    metadata: record.metadata,
    ipAddress: record.ipAddress,
    userAgent: record.userAgent,
    createdAt: record.createdAt.toISOString(),
  };
}

/** AUD-01 (M12): nhật ký kiểm toán, mới nhất trước, lọc theo hành động, người, đối tượng, ngày. */
@Injectable()
export class ListAuditLogs {
  constructor(
    @Inject(AuditRecords) private readonly audit: Pick<AuditRecords, 'auditPage'>,
    @Inject(IdentityDirectory)
    private readonly identity: Pick<IdentityDirectory, 'describeUsers' | 'findPersonByEmail'>,
  ) {}

  async execute(query: AuditLogQuery): Promise<AuditLogPage> {
    const { actorEmail, ...filter } = query;
    let actorUserId: string | undefined;
    if (actorEmail) {
      const person = await this.identity.findPersonByEmail(actorEmail);
      if (!person) {
        return { items: [], nextCursor: null };
      }
      actorUserId = person.userId;
    }
    const records = await this.audit.auditPage({ ...filter, actorUserId }, AUDIT_PAGE_SIZE + 1);
    const page = records.slice(0, AUDIT_PAGE_SIZE);
    const actors = await actorsOf(
      this.identity,
      page.map((record) => record.actorUserId),
    );
    return {
      items: page.map((record) => presentLog(record, actors)),
      nextCursor: records.length > AUDIT_PAGE_SIZE ? (page.at(-1)?.id ?? null) : null,
    };
  }
}

/** Gắn sản phẩm, bên liên quan và kết quả xử lý vào cảnh báo. */
@Injectable()
export class AlertViews {
  constructor(
    @Inject(AuditRecords) private readonly audit: Pick<AuditRecords, 'reviewsOf'>,
    @Inject(ProductDirectory) private readonly products: Pick<ProductDirectory, 'describe'>,
    @Inject(IdentityDirectory)
    private readonly identity: Pick<IdentityDirectory, 'describeUsers' | 'describeParties'>,
    @Inject(OrganizationDirectory)
    private readonly organizations: Pick<OrganizationDirectory, 'describe'>,
  ) {}

  async present(records: readonly AnomalyAlertRecord[]): Promise<AnomalyAlertView[]> {
    const productIds = records.flatMap((record) => (record.productId ? [record.productId] : []));
    const partyIds = records.flatMap((record) => (record.partyId ? [record.partyId] : []));
    const [products, parties, reviews] = await Promise.all([
      productIds.length > 0 ? this.products.describe(productIds) : new Map(),
      partyIds.length > 0 ? this.identity.describeParties(partyIds) : new Map(),
      this.audit.reviewsOf(
        records.filter((record) => record.status !== 'OPEN').map((record) => record.id),
      ),
    ]);
    const organizationIds = [...parties.values()]
      .filter((party) => party.kind === 'ORGANIZATION')
      .map((party) => party.partyId);
    const [organizations, actors] = await Promise.all([
      organizationIds.length > 0 ? this.organizations.describe(organizationIds) : new Map(),
      actorsOf(this.identity, [
        ...[...parties.values()].map((party) => party.userId),
        ...records.map((record) => record.reviewedByUserId),
      ]),
    ]);

    const partyOf = (partyId: string | null): AlertParty | null => {
      const party = partyId ? parties.get(partyId) : undefined;
      if (!party) {
        return null;
      }
      if (party.kind === 'ORGANIZATION') {
        const organization = organizations.get(party.partyId);
        return organization ? { kind: 'ORGANIZATION', name: organization.name, email: null } : null;
      }
      const user = party.userId ? actors.get(party.userId) : undefined;
      return user ? { kind: 'PERSON', name: user.fullName, email: user.email } : null;
    };

    return records.map((record) => {
      const product = record.productId ? products.get(record.productId) : undefined;
      const review = reviews.get(record.id);
      const decision = review?.metadata?.decision;
      const note = review?.metadata?.note;
      return {
        id: record.id,
        ruleCode: record.ruleCode,
        severity: record.severity,
        status: record.status,
        detectedAt: record.detectedAt.toISOString(),
        product: product
          ? {
              id: product.id,
              serialNumber: product.serialNumber,
              modelName: product.modelName,
              publicCode: product.publicCode,
            }
          : null,
        party: partyOf(record.partyId),
        details: record.details,
        review:
          record.status !== 'OPEN' && record.reviewedAt
            ? {
                decision: isDecision(decision)
                  ? decision
                  : record.status === 'DISMISSED'
                    ? 'DISMISSED'
                    : 'ACKNOWLEDGED',
                note: typeof note === 'string' ? note : null,
                by: record.reviewedByUserId ? (actors.get(record.reviewedByUserId) ?? null) : null,
                at: record.reviewedAt.toISOString(),
              }
            : null,
      };
    });
  }
}

export interface AlertListQuery {
  status: AlertStatusCode;
  severity?: AnomalySeverityLevel;
  ruleCode?: string;
  before?: string;
}

/** AUD-04 (M12): danh sách cảnh báo theo trạng thái, kèm số đếm từng trạng thái. */
@Injectable()
export class ListAnomalyAlerts {
  constructor(
    @Inject(AuditRecords) private readonly audit: Pick<AuditRecords, 'alertPage' | 'alertCounts'>,
    private readonly views: AlertViews,
  ) {}

  async execute(query: AlertListQuery): Promise<AnomalyAlertPage> {
    const [records, counts] = await Promise.all([
      this.audit.alertPage(query, ALERT_PAGE_SIZE + 1),
      this.audit.alertCounts(),
    ]);
    const page = records.slice(0, ALERT_PAGE_SIZE);
    return {
      items: await this.views.present(page),
      nextCursor: records.length > ALERT_PAGE_SIZE ? (page.at(-1)?.id ?? null) : null,
      counts,
    };
  }
}

@Injectable()
export class GetAnomalyAlert {
  constructor(
    @Inject(AuditRecords) private readonly audit: Pick<AuditRecords, 'alert'>,
    private readonly views: AlertViews,
  ) {}

  async execute(id: string): Promise<AnomalyAlertView> {
    const record = await this.audit.alert(id);
    if (!record) {
      throw new MonitoringAlertNotFoundError();
    }
    const [view] = await this.views.present([record]);
    if (!view) {
      throw new MonitoringAlertNotFoundError();
    }
    return view;
  }
}

/** Số cảnh báo đang mở cho thanh điều hướng Quản trị. */
@Injectable()
export class GetAlertSummary {
  constructor(
    @Inject(AuditRecords) private readonly audit: Pick<AuditRecords, 'openAlertsBySeverity'>,
  ) {}

  async execute(): Promise<AlertSummary> {
    const open = await this.audit.openAlertsBySeverity();
    return { open: open.LOW + open.MEDIUM + open.HIGH, openHigh: open.HIGH };
  }
}
