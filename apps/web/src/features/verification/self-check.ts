import {
  type AuthStatus,
  type ProductState,
  productMetadataHash,
  type PublicPassportView,
  type VerificationContracts,
  type WarrantyState,
} from '@dpp/shared';

/** `ProductPassport.product()` đã giải mã; partyId chữ thường, `null` khi là bytes32(0). */
export interface ChainProductView {
  issuerPartyId: string;
  metadataHash: string;
  custodianPartyId: string | null;
  pendingCustodianPartyId: string | null;
  ownerPartyId: string | null;
  /** `null` là contract không có sản phẩm này. */
  state: ProductState | null;
  warrantyMonths: number;
}

export interface ChainReceiptView {
  succeeded: boolean;
  logs: readonly { address: string; topics: readonly string[] }[];
}

/** Những gì trình duyệt đọc thẳng từ blockchain (RPC công khai hoặc MetaMask), không qua API. */
export interface SelfCheckReader {
  chainId(): Promise<number>;
  product(contract: string, productId: string): Promise<ChainProductView>;
  organizationStatus(contract: string, partyId: string): Promise<AuthStatus | null>;
  warranty(
    contract: string,
    productId: string,
  ): Promise<{ state: WarrantyState | null; expiresAt: Date | null }>;
  receipt(txHash: string): Promise<ChainReceiptView | null>;
}

export const SELF_CHECK_KEYS = [
  'NETWORK',
  'PROFILE',
  'ISSUER',
  'STATE',
  'CUSTODY',
  'OWNER',
  'WARRANTY',
  'TRANSACTIONS',
] as const;

export type SelfCheckKey = (typeof SELF_CHECK_KEYS)[number];

/** `ok`: `true` khớp, `false` lệch, `null` không kiểm được (thiếu dữ liệu, mạng sai). */
export interface SelfCheckItem {
  key: SelfCheckKey;
  ok: boolean | null;
  detail: string;
}

export interface SelfCheckInput {
  expectedChainId: number;
  passport: PublicPassportView;
  contracts: VerificationContracts;
}

const lower = (value: string) => value.toLowerCase();

/** Hồ sơ đúng như trang đang hiển thị, để trình duyệt tự băm lại. */
export function displayedMetadataHash(passport: PublicPassportView): string {
  return productMetadataHash({
    issuerPartyId: passport.issuer.partyId,
    serialNumber: passport.serialNumber,
    modelName: passport.modelName,
    description: passport.description,
    manufacturedOn: passport.manufacturedOn,
    warrantyMonths: passport.warrantyMonths,
  });
}

/** Giao dịch trên dòng thời gian, không trùng, cũ nhất trước. */
export function timelineTransactions(passport: PublicPassportView): string[] {
  return [
    ...new Set(
      [passport.proof.registrationTxHash, ...passport.journey.map((step) => step.txHash)]
        .filter((hash) => hash !== null)
        .map(lower),
    ),
  ];
}

function knownContracts(contracts: VerificationContracts): Set<string> {
  return new Set(
    [
      contracts.productPassport,
      contracts.partyRegistry,
      contracts.warrantyManager,
      contracts.serviceTicketManager,
      contracts.inspectionRegistry,
      contracts.ownershipTransfer,
      contracts.productLifecycle,
    ]
      .filter((address) => address !== null)
      .map(lower),
  );
}

/** Giao dịch thành công và có event của contract hệ thống nhắc tới đúng sản phẩm này. */
export function receiptMentionsProduct(
  receipt: ChainReceiptView | null,
  productId: string,
  contracts: ReadonlySet<string>,
): boolean {
  return (
    receipt !== null &&
    receipt.succeeded &&
    receipt.logs.some(
      (log) =>
        contracts.has(lower(log.address)) &&
        log.topics.some((topic) => lower(topic) === lower(productId)),
    )
  );
}

function expectedCustodian(passport: PublicPassportView, chain: ChainProductView): string | null {
  const holder = passport.holder;
  if (!holder) {
    return null;
  }
  // Người dùng cá nhân không có partyId trên trang: bên giữ phải chính là chủ sở hữu.
  return holder.kind === 'ORGANIZATION' ? lower(holder.organization.partyId) : chain.ownerPartyId;
}

function sameSecond(left: Date | null, right: string): boolean {
  return (
    left !== null &&
    Math.floor(left.getTime() / 1000) === Math.floor(new Date(right).getTime() / 1000)
  );
}

/**
 * VER-01, VER-02 (M11): trình duyệt của người xem đọc thẳng blockchain rồi so với chính những gì
 * trang đang hiển thị: băm lại hồ sơ, trạng thái, bên giữ hàng, chủ, bảo hành, doanh nghiệp và mọi
 * giao dịch trên dòng thời gian. Không cần tin máy chủ của hệ thống.
 */
export async function runSelfCheck(
  reader: SelfCheckReader,
  input: SelfCheckInput,
  onProgress: (done: number, total: number) => void = () => undefined,
): Promise<SelfCheckItem[]> {
  const { passport, contracts } = input;
  const items: SelfCheckItem[] = [];
  const chainId = await reader.chainId();
  items.push({
    key: 'NETWORK',
    ok: chainId === input.expectedChainId,
    detail: `Đang đọc chain ID ${chainId}${chainId === input.expectedChainId ? '' : `, cần ${input.expectedChainId}`}.`,
  });
  if (chainId !== input.expectedChainId) {
    return items;
  }

  const productId = passport.proof.productId;
  const chain = await reader.product(contracts.productPassport, productId);
  const registered = chain.state !== null;
  items.push({
    key: 'PROFILE',
    ok:
      registered &&
      chain.metadataHash === lower(displayedMetadataHash(passport)) &&
      chain.issuerPartyId === lower(passport.issuer.partyId) &&
      chain.warrantyMonths === passport.warrantyMonths,
    detail: registered
      ? 'Băm lại hồ sơ đang hiển thị (model, serial, mô tả, ngày sản xuất, bảo hành, nhà sản xuất) rồi so với hash trên ProductPassport.'
      : 'ProductPassport không có sản phẩm này.',
  });
  if (!registered) {
    return items;
  }

  const issuerStatus = await reader.organizationStatus(
    contracts.partyRegistry,
    passport.issuer.partyId,
  );
  items.push({
    key: 'ISSUER',
    ok: issuerStatus === passport.issuer.authStatus,
    detail: 'Tình trạng doanh nghiệp phát hành trên PartyRegistry.',
  });
  items.push({
    key: 'STATE',
    ok: chain.state === passport.productState,
    detail: 'Trạng thái sản phẩm trên ProductPassport.',
  });
  items.push({
    key: 'CUSTODY',
    ok:
      chain.custodianPartyId === expectedCustodian(passport, chain) &&
      chain.pendingCustodianPartyId ===
        (passport.pendingRetailer ? lower(passport.pendingRetailer.partyId) : null),
    detail: 'Bên đang giữ hàng và nhà bán lẻ đang được giao tới.',
  });
  items.push({
    key: 'OWNER',
    ok: passport.hasOwner === (chain.ownerPartyId !== null),
    detail: 'Có chủ sở hữu hay chưa (trang không hiện danh tính chủ).',
  });

  if (contracts.warrantyManager) {
    const warranty = await reader.warranty(contracts.warrantyManager, productId);
    const shown = passport.warranty;
    items.push({
      key: 'WARRANTY',
      ok: shown
        ? warranty.state === shown.state && sameSecond(warranty.expiresAt, shown.expiresAt)
        : warranty.state === null,
      detail: 'Trạng thái và hạn bảo hành trên WarrantyManager.',
    });
  } else {
    items.push({ key: 'WARRANTY', ok: null, detail: 'Hệ thống chưa công bố WarrantyManager.' });
  }

  const hashes = timelineTransactions(passport);
  const known = knownContracts(contracts);
  let verified = 0;
  for (const [index, hash] of hashes.entries()) {
    if (receiptMentionsProduct(await reader.receipt(hash), productId, known)) {
      verified += 1;
    }
    onProgress(index + 1, hashes.length);
  }
  items.push({
    key: 'TRANSACTIONS',
    ok: verified === hashes.length,
    detail: `${verified}/${hashes.length} giao dịch trên dòng thời gian có thật, thành công và nhắc tới đúng sản phẩm này.`,
  });
  return items;
}
