import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { HealthIndicator } from '../application/health-indicator.port.js';
import { describeError } from '../application/health.service.js';
import type { ComponentHealth } from '../domain/health-report.js';

@Injectable()
export class DatabaseHealthIndicator implements HealthIndicator {
  readonly key = 'database';

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<ComponentHealth> {
    const startedAt = performance.now();
    try {
      const [row] = await this.prisma.$queryRaw<Array<{ version: string; database: string }>>`
        SELECT current_setting('server_version') AS version, current_database() AS database`;
      return {
        status: 'up',
        latencyMs: elapsedSince(startedAt),
        details: { serverVersion: row?.version ?? null, database: row?.database ?? null },
      };
    } catch (error) {
      return { status: 'down', latencyMs: elapsedSince(startedAt), error: describeError(error) };
    }
  }
}

export function elapsedSince(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}
