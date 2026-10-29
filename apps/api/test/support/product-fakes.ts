import { randomUUID } from 'node:crypto';
import {
  PRODUCT_REGISTRATION_TYPES,
  type ProductListFilter,
  type ProductRegistration,
  productPassportDomain,
  PUBLIC_CODE_ALPHABET,
} from '@dpp/shared';
import { Wallet } from 'ethers';
import type { AnomalyAlertWriter } from '../../src/modules/audit/application/anomaly-alert.writer.js';
import type { NewAnomalyAlert } from '../../src/modules/audit/domain/anomaly-alert.js';
import type {
  OnchainProduct,
  ProductChain,
  PublicCodeGenerator,
} from '../../src/modules/products/application/ports/product-chain.port.js';
import type {
  NewProductDraft,
  ProductListQuery,
  ProductRepository,
  RegisteredProjection,
} from '../../src/modules/products/application/ports/product.repository.js';
import { isDraft, type ProductRecord } from '../../src/modules/products/domain/product.js';
import { TEST_REGISTRAR_KEY } from './test-config.js';

export const TEST_PRODUCT_PASSPORT = '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512';

/** products và custody_records trong bộ nhớ, giữ UNIQUE(issuer, serial) và UNIQUE(public_code). */
export class InMemoryProducts implements ProductRepository {
  readonly rows: ProductRecord[] = [];
  readonly custody: { productId: string; toPartyId: string; eventId: string }[] = [];

  async findById(id: string) {
    return this.rows.find((row) => row.id === id) ?? null;
  }

  async findByPublicCode(publicCode: string) {
    return this.rows.find((row) => row.publicCode === publicCode) ?? null;
  }

  async findByChainProductId(chainProductId: string) {
    return this.rows.find((row) => row.chainProductId === chainProductId.toLowerCase()) ?? null;
  }

  async serialsTaken(issuerOrgId: string, serials: readonly string[]) {
    return this.rows
      .filter((row) => row.issuerOrgId === issuerOrgId && serials.includes(row.serialNumber))
      .map((row) => row.serialNumber);
  }

  async publicCodesTaken(codes: readonly string[]) {
    return this.rows.filter((row) => codes.includes(row.publicCode)).map((row) => row.publicCode);
  }

  async createDrafts(drafts: readonly NewProductDraft[]) {
    const created = drafts.map((draft): ProductRecord => ({
      ...draft,
      id: randomUUID(),
      productState: null,
      currentCustodianPartyId: null,
      createdTxHash: null,
      syncStatus: 'PENDING',
      onchainCreatedAt: null,
      createdAt: new Date(),
    }));
    for (const row of created) {
      if (
        this.rows.some(
          (other) =>
            other.publicCode === row.publicCode ||
            (other.issuerOrgId === row.issuerOrgId && other.serialNumber === row.serialNumber),
        )
      ) {
        throw new Error('unique violation');
      }
    }
    this.rows.push(...created);
    return created;
  }

  async findOwned(issuerOrgId: string, ids: readonly string[]) {
    return this.rows.filter((row) => row.issuerOrgId === issuerOrgId && ids.includes(row.id));
  }

  async list(issuerOrgId: string, query: ProductListQuery) {
    const items = this.rows.filter(
      (row) =>
        row.issuerOrgId === issuerOrgId &&
        (query.filter === 'ALL' || (query.filter === 'DRAFT') === isDraft(row)),
    );
    const start = (query.page - 1) * query.pageSize;
    return { items: items.slice(start, start + query.pageSize), total: items.length };
  }

  async counts(issuerOrgId: string): Promise<Record<ProductListFilter, number>> {
    const own = this.rows.filter((row) => row.issuerOrgId === issuerOrgId);
    const drafts = own.filter(isDraft).length;
    return { ALL: own.length, REGISTERED: own.length - drafts, DRAFT: drafts };
  }

  async deleteDraft(id: string) {
    const index = this.rows.findIndex((row) => row.id === id && isDraft(row));
    if (index < 0) {
      return false;
    }
    this.rows.splice(index, 1);
    return true;
  }

  async markRegistered(id: string, projection: RegisteredProjection) {
    const index = this.rows.findIndex((row) => row.id === id);
    const row = this.rows[index];
    if (!row) {
      throw new Error(`Không có sản phẩm ${id}`);
    }
    const next: ProductRecord = {
      ...row,
      productState: 'CREATED',
      currentCustodianPartyId: projection.issuerPartyId,
      createdTxHash: projection.txHash,
      onchainCreatedAt: projection.at,
      syncStatus: 'CONFIRMED',
    };
    this.rows[index] = next;
    return next;
  }

  async markFailed(id: string) {
    const index = this.rows.findIndex((row) => row.id === id);
    const row = this.rows[index];
    if (row) {
      this.rows[index] = { ...row, syncStatus: 'FAILED' };
    }
  }

  async recordCustody(productId: string, toPartyId: string, eventId: string) {
    if (!this.custody.some((record) => record.eventId === eventId)) {
      this.custody.push({ productId, toPartyId, eventId });
    }
  }

  only(): ProductRecord {
    const [row] = this.rows;
    if (!row) {
      throw new Error('Chưa có sản phẩm nào');
    }
    return row;
  }
}

/** ProductPassport giả: ký giấy phép bằng khoá registrar của test; sản phẩm on-chain chỉnh được. */
export class FakeProductChain implements ProductChain {
  readonly chainId = 31337;
  contractAddress: string | null = TEST_PRODUCT_PASSPORT;
  readonly onchain = new Map<string, OnchainProduct>();
  readonly signed: ProductRegistration[] = [];
  failing = false;
  private readonly registrar = new Wallet(TEST_REGISTRAR_KEY);

  async signRegistration(registration: ProductRegistration) {
    this.signed.push(registration);
    return this.registrar.signTypedData(
      productPassportDomain(this.chainId, this.contractAddress ?? ''),
      PRODUCT_REGISTRATION_TYPES,
      registration,
    );
  }

  async readProduct(chainProductId: string) {
    if (this.failing) {
      throw new Error('connect ECONNREFUSED');
    }
    return this.onchain.get(chainProductId.toLowerCase()) ?? null;
  }
}

/** Trả lần lượt các mã cho trước (để thử trường hợp trùng), hết thì sinh mã theo số thứ tự. */
export class SequenceCodes implements PublicCodeGenerator {
  private counter = 0;

  constructor(private readonly queue: string[] = []) {}

  next(): string {
    const queued = this.queue.shift();
    if (queued) {
      return queued;
    }
    this.counter += 1;
    let rest = this.counter;
    let suffix = '';
    for (let digit = 0; digit < 4; digit += 1) {
      suffix = `${PUBLIC_CODE_ALPHABET[rest % 32] ?? 'A'}${suffix}`;
      rest = Math.floor(rest / 32);
    }
    return `KMNPQRST${suffix}`;
  }
}

/** Ghi cảnh báo như PrismaAnomalyAlertWriter (không gộp theo sản phẩm, đủ cho test). */
export class RecordingAlerts implements AnomalyAlertWriter {
  readonly raised: NewAnomalyAlert[] = [];

  async raiseIfNew(alert: NewAnomalyAlert) {
    this.raised.push(alert);
    return true;
  }
}
