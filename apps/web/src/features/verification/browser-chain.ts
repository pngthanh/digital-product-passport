import {
  decodeChainEnum,
  getNetwork,
  PARTY_REGISTRY_ABI,
  PRODUCT_PASSPORT_ABI,
  WARRANTY_MANAGER_ABI,
} from '@dpp/shared';
import {
  BrowserProvider,
  Contract,
  type InterfaceAbi,
  type JsonRpcApiProvider,
  JsonRpcProvider,
  Network,
} from 'ethers';
import { injectedProvider } from '@/lib/wallet/ethereum';
import type { ChainProductView, ChainReceiptView, SelfCheckReader } from './self-check';

const ZERO = `0x${'0'.repeat(64)}`;
const PROBE_TIMEOUT_MS = 6000;

function isBytes32(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function partyOrNull(value: string): string | null {
  return value.toLowerCase() === ZERO ? null : value.toLowerCase();
}

function parseProduct(value: unknown): ChainProductView {
  if (!Array.isArray(value)) {
    throw new Error('ProductPassport.product() trả về giá trị lạ');
  }
  const [issuerId, metadataHash, custodianId, pendingId, ownerId, state, months]: unknown[] = value;
  if (
    !isBytes32(issuerId) ||
    !isBytes32(metadataHash) ||
    !isBytes32(custodianId) ||
    !isBytes32(pendingId) ||
    !isBytes32(ownerId) ||
    typeof state !== 'bigint' ||
    typeof months !== 'bigint'
  ) {
    throw new Error('ProductPassport.product() trả về giá trị lạ');
  }
  return {
    issuerPartyId: issuerId.toLowerCase(),
    metadataHash: metadataHash.toLowerCase(),
    custodianPartyId: partyOrNull(custodianId),
    pendingCustodianPartyId: partyOrNull(pendingId),
    ownerPartyId: partyOrNull(ownerId),
    state: decodeChainEnum('ProductState', state),
    warrantyMonths: Number(months),
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('RPC không trả lời')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

class EthersSelfCheckReader implements SelfCheckReader {
  constructor(
    private readonly provider: JsonRpcApiProvider,
    readonly source: string,
  ) {}

  /** Hỏi thẳng node (không dùng mạng khai báo sẵn) để biết đang đọc đúng chain. */
  async chainId(): Promise<number> {
    const value: unknown = await this.provider.send('eth_chainId', []);
    return typeof value === 'string' ? Number(BigInt(value)) : Number.NaN;
  }

  async product(contract: string, productId: string): Promise<ChainProductView> {
    return parseProduct(await this.call(contract, PRODUCT_PASSPORT_ABI, 'product', productId));
  }

  async organizationStatus(contract: string, partyId: string) {
    const value = await this.call(contract, PARTY_REGISTRY_ABI, 'organization', partyId);
    const status: unknown = Array.isArray(value) ? value[1] : undefined;
    if (typeof status !== 'bigint') {
      throw new Error('PartyRegistry.organization() trả về giá trị lạ');
    }
    return decodeChainEnum('OrganizationStatus', status);
  }

  async warranty(contract: string, productId: string) {
    const [stateValue, warrantyValue] = await Promise.all([
      this.call(contract, WARRANTY_MANAGER_ABI, 'effectiveWarrantyState', productId),
      this.call(contract, WARRANTY_MANAGER_ABI, 'warrantyOf', productId),
    ]);
    const expires: unknown = Array.isArray(warrantyValue) ? warrantyValue[2] : undefined;
    if (typeof stateValue !== 'bigint' || typeof expires !== 'bigint') {
      throw new Error('WarrantyManager trả về giá trị lạ');
    }
    return {
      state: decodeChainEnum('WarrantyState', stateValue),
      expiresAt: expires === 0n ? null : new Date(Number(expires) * 1000),
    };
  }

  async receipt(txHash: string): Promise<ChainReceiptView | null> {
    const receipt = await this.provider.getTransactionReceipt(txHash);
    return receipt
      ? {
          succeeded: receipt.status === 1,
          logs: receipt.logs.map((log) => ({ address: log.address, topics: log.topics })),
        }
      : null;
  }

  private async call(
    address: string,
    abi: InterfaceAbi,
    method: string,
    argument: string,
  ): Promise<unknown> {
    const contract = new Contract(address, abi, this.provider);
    const value: unknown = await contract.getFunction(method).staticCall(argument);
    return value;
  }
}

/**
 * Kết nối RPC công khai của mạng (thử lần lượt từng địa chỉ); không được thì dùng MetaMask nếu có.
 * Trả `null` khi không đọc được blockchain từ trình duyệt này.
 */
export async function connectSelfCheckReader(
  chainId: number,
): Promise<(SelfCheckReader & { source: string }) | null> {
  const network = Network.from(chainId);
  for (const url of getNetwork(chainId)?.rpcUrls ?? []) {
    const provider = new JsonRpcProvider(url, network, { staticNetwork: network });
    try {
      await withTimeout(provider.getBlockNumber(), PROBE_TIMEOUT_MS);
      return new EthersSelfCheckReader(provider, new URL(url).host);
    } catch {
      provider.destroy();
    }
  }
  const injected = injectedProvider();
  if (injected) {
    return new EthersSelfCheckReader(new BrowserProvider(injected), 'MetaMask');
  }
  return null;
}
