import { Injectable } from '@nestjs/common';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import type { ChainEvent } from '../domain/chain-event.js';

/**
 * Module nghiệp vụ sở hữu projector cho event của mình và đăng ký vào đây.
 * Projector chạy trong cùng giao dịch với việc ghi blockchain_events nên không chiếu hai lần.
 */
export interface EventProjector {
  readonly contractName: string;
  readonly eventNames: readonly string[];
  project(event: ChainEvent, scope: TransactionScope): Promise<void>;
}

@Injectable()
export class EventProjectorRegistry {
  private readonly projectors = new Map<string, EventProjector>();

  register(projector: EventProjector): void {
    for (const eventName of projector.eventNames) {
      const key = this.key(projector.contractName, eventName);
      if (this.projectors.has(key)) {
        throw new Error(`Event ${key} đã có projector`);
      }
      this.projectors.set(key, projector);
    }
  }

  find(contractName: string, eventName: string): EventProjector | undefined {
    return this.projectors.get(this.key(contractName, eventName));
  }

  private key(contractName: string, eventName: string): string {
    return `${contractName}.${eventName}`;
  }
}
