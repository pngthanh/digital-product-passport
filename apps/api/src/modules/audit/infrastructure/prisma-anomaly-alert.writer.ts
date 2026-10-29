import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { AnomalyAlertWriter } from '../application/anomaly-alert.writer.js';
import type { NewAnomalyAlert } from '../domain/anomaly-alert.js';

@Injectable()
export class PrismaAnomalyAlertWriter implements AnomalyAlertWriter {
  constructor(private readonly prisma: PrismaService) {}

  async raiseIfNew(alert: NewAnomalyAlert): Promise<boolean> {
    const target = { partyId: alert.partyId ?? null, productId: alert.productId ?? null };
    const open = await this.prisma.anomalyAlert.findFirst({
      where: { ruleCode: alert.ruleCode, alertStatus: 'OPEN', ...target },
      select: { id: true },
    });
    if (open) {
      return false;
    }
    await this.prisma.anomalyAlert.create({
      data: {
        ruleCode: alert.ruleCode,
        severity: alert.severity,
        details: alert.details,
        ...target,
      },
    });
    return true;
  }
}
