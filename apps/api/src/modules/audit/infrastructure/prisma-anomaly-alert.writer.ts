import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { AnomalyAlertWriter } from '../application/anomaly-alert.writer.js';
import type { NewAnomalyAlert } from '../domain/anomaly-alert.js';

const HOUR_MS = 3_600_000;

@Injectable()
export class PrismaAnomalyAlertWriter implements AnomalyAlertWriter {
  constructor(private readonly prisma: PrismaService) {}

  async raiseIfNew(alert: NewAnomalyAlert): Promise<boolean> {
    const target = { partyId: alert.partyId ?? null, productId: alert.productId ?? null };
    const existing = alert.dedupeKey
      ? await this.prisma.anomalyAlert.findFirst({
          where: {
            ruleCode: alert.ruleCode,
            details: { path: ['dedupeKey'], equals: alert.dedupeKey },
            ...(alert.repeatAfterHours === undefined
              ? {}
              : {
                  OR: [
                    { alertStatus: 'OPEN' },
                    {
                      detectedAt: {
                        gte: new Date(Date.now() - alert.repeatAfterHours * HOUR_MS),
                      },
                    },
                  ],
                }),
          },
          select: { id: true },
        })
      : await this.prisma.anomalyAlert.findFirst({
          where: { ruleCode: alert.ruleCode, alertStatus: 'OPEN', ...target },
          select: { id: true },
        });
    if (existing) {
      return false;
    }
    await this.prisma.anomalyAlert.create({
      data: {
        ruleCode: alert.ruleCode,
        severity: alert.severity,
        details: alert.dedupeKey ? { ...alert.details, dedupeKey: alert.dedupeKey } : alert.details,
        ...target,
      },
    });
    return true;
  }
}
