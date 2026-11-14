import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type AuthStatus,
  PARTY_REGISTRY_CONTRACT_NAME,
  partyIdFromUuid,
  PRODUCT_PASSPORT_CONTRACT_NAME,
  type PartyLabel,
  type OnchainSnapshot,
  type PublicVerificationView,
  uuidFromPartyId,
  type VerificationCheck,
  WARRANTY_MANAGER_CONTRACT_NAME,
  type WarrantyState,
} from '@dpp/shared';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import { AnomalyAlerts, AnomalyRule } from '../../audit/index.js';
import { IndexedChainState } from '../../chain-sync/index.js';
import { OrganizationDirectory, type OrganizationRef } from '../../organizations/index.js';
import { ProductDirectory, type ProductRef } from '../../products/index.js';
import {
  type ChainFacts,
  type ChainPassport,
  type ChainRead,
  compareChecks,
  overallStatus,
  type RecordedPassport,
  type WarrantyFacts,
} from '../domain/verification.js';
import { VerificationProductNotFoundError } from '../domain/verification.errors.js';
import { VERIFICATION_CHAIN, type VerificationChain } from './ports/verification-chain.port.js';

/** Kết quả giữ trong bộ nhớ ngần này, để nhiều người cùng mở một hộ chiếu không dội RPC. */
export const VERIFICATION_CACHE_MS = 15_000;
const CACHE_MAX_ENTRIES = 1000;

function chainPartyOf(uuid: string | null): string | null {
  return uuid ? partyIdFromUuid(uuid).toLowerCase() : null;
}

function uuidOf(chainPartyId: string | null): string | null {
  if (!chainPartyId) {
    return null;
  }
  try {
    return uuidFromPartyId(chainPartyId);
  } catch {
    return null;
  }
}

function labelOf(
  chainPartyId: string | null,
  organizations: ReadonlyMap<string, OrganizationRef>,
): PartyLabel | null {
  const uuid = uuidOf(chainPartyId);
  if (!chainPartyId) {
    return null;
  }
  const organization = uuid ? organizations.get(uuid) : undefined;
  return organization
    ? {
        kind: 'ORGANIZATION',
        organization: {
          organizationId: organization.id,
          name: organization.name,
          partyId: organization.partyId,
        },
      }
    : { kind: 'PERSON', isYou: false };
}

function effectiveState(warranty: WarrantyFacts | null, now: Date): WarrantyState | null {
  if (!warranty) {
    return null;
  }
  if (now.getTime() >= warranty.expiresAt.getTime()) {
    return 'EXPIRED';
  }
  return warranty.suspended ? 'SUSPENDED' : 'ACTIVE';
}

/**
 * VER-01 (M11): đối chiếu hộ chiếu công khai với contract. Đọc hàm view tại block Indexer đã chốt
 * (cùng cách đối soát ví ở M3): mọi event tới block đó đã chiếu vào CSDL nên hai bên phải giống
 * nhau; sản phẩm có giao dịch mới hơn mốc thì báo "đang cập nhật" thay vì kết luận lệch. Lệch thật
 * thì tạo cảnh báo bất thường cho Admin (không tạo trùng khi cảnh báo cũ còn mở).
 */
@Injectable()
export class VerifyPublicProduct {
  private readonly logger = new Logger(VerifyPublicProduct.name);
  private readonly cache = new Map<string, { expiresAt: number; view: PublicVerificationView }>();
  private readonly inflight = new Map<string, Promise<PublicVerificationView>>();

  constructor(
    @Inject(ProductDirectory)
    private readonly products: Pick<
      ProductDirectory,
      'findByPublicCode' | 'findById' | 'warrantiesOf'
    >,
    @Inject(OrganizationDirectory)
    private readonly organizations: Pick<OrganizationDirectory, 'describe'>,
    @Inject(IndexedChainState)
    private readonly chainState: Pick<IndexedChainState, 'indexedMark' | 'keysChangedAfter'>,
    @Inject(VERIFICATION_CHAIN) private readonly chain: VerificationChain,
    private readonly alerts: AnomalyAlerts,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(publicCode: string): Promise<PublicVerificationView> {
    const product = await this.products.findByPublicCode(publicCode);
    if (!product) {
      throw new VerificationProductNotFoundError();
    }
    const cached = this.cache.get(product.id);
    if (cached && cached.expiresAt > this.clock.now().getTime()) {
      return cached.view;
    }
    const running = this.inflight.get(product.id);
    if (running) {
      return running;
    }
    const task = this.verify(product.id).finally(() => this.inflight.delete(product.id));
    this.inflight.set(product.id, task);
    const view = await task;
    this.remember(product.id, view);
    return view;
  }

  private remember(productId: string, view: PublicVerificationView): void {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next();
      if (!oldest.done) {
        this.cache.delete(oldest.value);
      }
    }
    this.cache.set(productId, {
      expiresAt: this.clock.now().getTime() + VERIFICATION_CACHE_MS,
      view,
    });
  }

  private async verify(productId: string): Promise<PublicVerificationView> {
    const contracts = this.chain.contracts();
    // Thứ tự: mốc Indexer → dữ liệu chiếu → event sau mốc (xem IndexedChainState), nên sản phẩm
    // được đọc lại sau khi có mốc.
    const [passportMark, warrantyMark, registryMark] = await Promise.all([
      this.chainState.indexedMark(PRODUCT_PASSPORT_CONTRACT_NAME),
      this.chainState.indexedMark(WARRANTY_MANAGER_CONTRACT_NAME),
      this.chainState.indexedMark(PARTY_REGISTRY_CONTRACT_NAME),
    ]);
    const product = await this.products.findById(productId);
    if (!product) {
      throw new VerificationProductNotFoundError();
    }
    const [warranties, issuers] = await Promise.all([
      this.products.warrantiesOf([product.id]),
      this.organizations.describe([product.issuerOrgId]),
    ]);
    const issuer = issuers.get(product.issuerOrgId);
    if (!issuer) {
      throw new VerificationProductNotFoundError();
    }
    const warranty = warranties.get(product.id);
    const recorded: RecordedPassport = {
      metadataHash: product.metadataHash.toLowerCase(),
      issuerPartyId: issuer.partyId.toLowerCase(),
      issuerStatus: issuer.authStatus,
      productState: product.productState,
      warrantyMonths: product.warrantyMonths,
      custodianPartyId: chainPartyOf(product.currentCustodianPartyId),
      pendingCustodianPartyId: chainPartyOf(product.pendingCustodianPartyId),
      ownerPartyId: chainPartyOf(product.currentOwnerPartyId),
      warranty: warranty
        ? {
            activatedByPartyId: partyIdFromUuid(warranty.activatedByPartyId).toLowerCase(),
            activatedAt: warranty.activatedAt,
            expiresAt: warranty.expiresAt,
            suspended: warranty.suspended,
          }
        : null,
    };

    const productKey = product.chainProductId.toLowerCase();
    const [passport, warrantyRead, issuerStatus] = await Promise.all([
      this.read(PRODUCT_PASSPORT_CONTRACT_NAME, passportMark?.block ?? null, productKey, (block) =>
        this.chain.readPassport(productKey, block),
      ),
      this.read(WARRANTY_MANAGER_CONTRACT_NAME, warrantyMark?.block ?? null, productKey, (block) =>
        this.chain.readWarranty(productKey, block),
      ),
      this.read(
        PARTY_REGISTRY_CONTRACT_NAME,
        registryMark?.block ?? null,
        recorded.issuerPartyId,
        (block) => this.chain.readOrganizationStatus(recorded.issuerPartyId, block),
      ),
    ]);
    const facts: ChainFacts = { passport, warranty: warrantyRead, issuerStatus };
    const now = this.clock.now();
    const checks = compareChecks(recorded, facts, now);
    const status = overallStatus(checks);
    if (status === 'MISMATCH') {
      await this.raiseMismatch(product, checks, recorded, facts, passportMark?.block ?? null);
    }
    return {
      status,
      checks,
      onchain: await this.snapshot(facts, now),
      atBlock: passportMark?.block.toString() ?? null,
      indexedAt: passportMark?.at.toISOString() ?? null,
      checkedAt: now.toISOString(),
      contracts,
    };
  }

  /** Đọc contract tại mốc đã chốt; có event của đối tượng sau mốc thì chưa so (`syncing`). */
  private async read<T>(
    contractName: string,
    block: bigint | null,
    correlationKey: string,
    load: (block: bigint) => Promise<T>,
  ): Promise<ChainRead<T>> {
    if (block === null) {
      return { kind: 'unavailable' };
    }
    try {
      const changed = await this.chainState.keysChangedAfter(contractName, block);
      if (changed.has(correlationKey)) {
        return { kind: 'syncing' };
      }
      return { kind: 'read', value: await load(block) };
    } catch (error) {
      this.logger.warn(
        `Không đọc được ${contractName} tại block ${block.toString()}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { kind: 'unavailable' };
    }
  }

  /** Giá trị trên blockchain để trang ghi "tin theo blockchain"; người dùng cá nhân không hiện danh tính. */
  private async snapshot(facts: ChainFacts, now: Date): Promise<OnchainSnapshot | null> {
    const passport: ChainPassport | null =
      facts.passport.kind === 'read' ? facts.passport.value : null;
    const warranty: WarrantyFacts | null =
      facts.warranty.kind === 'read' ? facts.warranty.value : null;
    const issuerStatus: AuthStatus | null =
      facts.issuerStatus.kind === 'read' ? facts.issuerStatus.value : null;
    if (!passport && facts.warranty.kind !== 'read' && facts.issuerStatus.kind !== 'read') {
      return null;
    }
    const uuids = [passport?.custodianPartyId ?? null, passport?.pendingCustodianPartyId ?? null]
      .map(uuidOf)
      .filter((uuid) => uuid !== null);
    const organizations =
      uuids.length > 0
        ? await this.organizations.describe(uuids)
        : new Map<string, OrganizationRef>();
    const pending = labelOf(passport?.pendingCustodianPartyId ?? null, organizations);
    return {
      metadataHash: passport?.metadataHash ?? null,
      issuerPartyId: passport?.issuerPartyId ?? null,
      issuerStatus,
      productState: passport?.productState ?? null,
      holder: labelOf(passport?.custodianPartyId ?? null, organizations),
      pendingRetailer:
        pending?.kind === 'ORGANIZATION'
          ? { name: pending.organization.name, partyId: pending.organization.partyId }
          : null,
      hasOwner: passport?.ownerPartyId !== null && passport?.ownerPartyId !== undefined,
      warrantyState: effectiveState(warranty, now),
      warrantyExpiresAt: warranty?.expiresAt.toISOString() ?? null,
    };
  }

  private async raiseMismatch(
    product: ProductRef,
    checks: readonly VerificationCheck[],
    recorded: RecordedPassport,
    facts: ChainFacts,
    atBlock: bigint | null,
  ): Promise<void> {
    const passport = facts.passport.kind === 'read' ? facts.passport.value : null;
    await this.alerts.raise({
      ruleCode: AnomalyRule.PUBLIC_VERIFICATION_MISMATCH,
      severity: 'HIGH',
      productId: product.id,
      details: {
        checks: checks
          .filter((check) => check.status === 'MISMATCH')
          .map((check) => check.key)
          .join(','),
        atBlock: atBlock?.toString() ?? null,
        databaseState: recorded.productState,
        chainState: passport?.productState ?? null,
        databaseCustodian: recorded.custodianPartyId,
        chainCustodian: passport?.custodianPartyId ?? null,
        databaseOwner: recorded.ownerPartyId,
        chainOwner: passport?.ownerPartyId ?? null,
      },
    });
  }
}
