import { Injectable } from '@nestjs/common';
import type { AlertStatusCode, AnomalySeverityLevel } from '@dpp/shared';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { Prisma } from '../../../infrastructure/database/generated/client.js';
import type { AnomalyAlertRepository } from '../application/ports/anomaly-alert.repository.js';
import {
  type AlertReviewDecision,
  type AnomalyAlertFilter,
  type AnomalyAlertRecord,
  detailValues,
} from '../domain/audit-records.js';

type AlertRow = Prisma.AnomalyAlertGetPayload<object>;

function toRecord(row: AlertRow): AnomalyAlertRecord {
  return {
    id: row.id,
    ruleCode: row.ruleCode,
    severity: row.severity,
    status: row.alertStatus,
    productId: row.productId,
    partyId: row.partyId,
    details: detailValues(row.details),
    detectedAt: row.detectedAt,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt,
  };
}

@Injectable()
export class PrismaAnomalyAlertRepository implements AnomalyAlertRepository {
  constructor(private readonly prisma: PrismaService) {}

  async page(filter: AnomalyAlertFilter, limit: number): Promise<AnomalyAlertRecord[]> {
    const rows = await this.prisma.anomalyAlert.findMany({
      where: {
        alertStatus: filter.status,
        severity: filter.severity,
        ruleCode: filter.ruleCode,
        id: filter.before ? { lt: filter.before } : undefined,
      },
      orderBy: { id: 'desc' },
      take: limit,
    });
    return rows.map(toRecord);
  }

  async find(id: string): Promise<AnomalyAlertRecord | null> {
    const row = await this.prisma.anomalyAlert.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }

  async countByStatus(): Promise<Record<AlertStatusCode, number>> {
    const groups = await this.prisma.anomalyAlert.groupBy({
      by: ['alertStatus'],
      _count: { _all: true },
    });
    const counts: Record<AlertStatusCode, number> = { OPEN: 0, ACKNOWLEDGED: 0, DISMISSED: 0 };
    for (const group of groups) {
      counts[group.alertStatus] = group._count._all;
    }
    return counts;
  }

  async openBySeverity(): Promise<Record<AnomalySeverityLevel, number>> {
    const groups = await this.prisma.anomalyAlert.groupBy({
      by: ['severity'],
      where: { alertStatus: 'OPEN' },
      _count: { _all: true },
    });
    const counts: Record<AnomalySeverityLevel, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
    for (const group of groups) {
      counts[group.severity] = group._count._all;
    }
    return counts;
  }

  async review(id: string, decision: AlertReviewDecision): Promise<boolean> {
    const { count } = await this.prisma.anomalyAlert.updateMany({
      where: { id, alertStatus: 'OPEN' },
      data: {
        alertStatus: decision.decision,
        reviewedByUserId: decision.reviewerUserId,
        reviewedAt: decision.at,
      },
    });
    return count === 1;
  }
}
