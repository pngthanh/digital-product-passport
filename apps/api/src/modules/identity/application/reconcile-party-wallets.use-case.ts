import { Inject, Injectable } from '@nestjs/common';
import { PARTY_REGISTRY_CONTRACT_NAME } from '@dpp/shared';
import { AnomalyAlerts, AnomalyRule } from '../../audit/index.js';
import { IndexedChainState } from '../../chain-sync/index.js';
import {
  PARTY_REGISTRY_READER,
  type PartyRegistryReader,
} from './ports/party-registry-reader.port.js';
import {
  PARTY_WALLET_REPOSITORY,
  type PartyWalletRepository,
} from './ports/party-wallet.repository.js';

const PAGE_SIZE = 100;

export interface ReconciliationSummary {
  /** Block on-chain dùng để so; `null` khi Indexer chưa quét PartyRegistry. */
  atBlock: bigint | null;
  checked: number;
  /** Party có event sau mốc (đang đổi ví): để lượt sau. */
  skipped: number;
  mismatched: number;
  /** Cảnh báo mới; lệch đã có cảnh báo OPEN thì không tạo thêm. */
  raised: number;
}

/**
 * Worker: đối soát ví của Party trong CSDL với PartyRegistry.walletOf tại block Indexer đã chốt.
 * Lệch nghĩa là bản chiếu đã sai (bỏ sót event, sửa tay CSDL): tạo anomaly_alerts mức HIGH.
 */
@Injectable()
export class ReconcilePartyWallets {
  constructor(
    @Inject(PARTY_WALLET_REPOSITORY) private readonly wallets: PartyWalletRepository,
    @Inject(PARTY_REGISTRY_READER) private readonly registry: PartyRegistryReader,
    private readonly chainState: IndexedChainState,
    private readonly alerts: AnomalyAlerts,
  ) {}

  async runOnce(): Promise<ReconciliationSummary> {
    const atBlock = await this.chainState.indexedBlock(PARTY_REGISTRY_CONTRACT_NAME);
    const summary: ReconciliationSummary = {
      atBlock,
      checked: 0,
      skipped: 0,
      mismatched: 0,
      raised: 0,
    };
    if (atBlock === null) {
      return summary;
    }

    let after: string | null = null;
    for (;;) {
      const parties = await this.wallets.listRegisteredParties(after, PAGE_SIZE);
      // Đọc sau dữ liệu chiếu: thay đổi nào đã chiếu sau mốc đều nằm trong danh sách này.
      const changed = await this.chainState.keysChangedAfter(PARTY_REGISTRY_CONTRACT_NAME, atBlock);
      for (const party of parties) {
        if (changed.has(party.chainPartyId)) {
          summary.skipped += 1;
          continue;
        }
        const chainWallet = await this.registry.walletOf(party.chainPartyId, atBlock);
        summary.checked += 1;
        if (chainWallet === party.activeWallet) {
          continue;
        }
        summary.mismatched += 1;
        const raised = await this.alerts.raise({
          ruleCode: AnomalyRule.PARTY_WALLET_MISMATCH,
          severity: 'HIGH',
          partyId: party.partyId,
          details: {
            chainPartyId: party.chainPartyId,
            chainWallet,
            databaseWallet: party.activeWallet,
            checkedAtBlock: atBlock.toString(),
          },
        });
        summary.raised += raised ? 1 : 0;
      }
      const last = parties.at(-1);
      if (!last || parties.length < PAGE_SIZE) {
        return summary;
      }
      after = last.partyId;
    }
  }
}
