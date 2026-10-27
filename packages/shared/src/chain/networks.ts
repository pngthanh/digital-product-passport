export interface BlockExplorer {
  readonly name: string;
  readonly url: string;
}

export interface ChainNetwork {
  readonly chainId: number;
  readonly name: string;
  readonly nativeCurrency: {
    readonly name: string;
    readonly symbol: string;
    readonly decimals: number;
  };
  readonly rpcUrls: readonly string[];
  readonly wsUrl?: string;
  readonly explorers: readonly BlockExplorer[];
  readonly faucetUrl?: string;
  /** Thời gian sinh block trung bình (ms). */
  readonly blockTimeMs: number;
  /** Số block để một block được finalized (không thể reorg). */
  readonly finalityBlocks: number;
}

/**
 * Monad Testnet — https://docs.monad.xyz/developer-essentials/testnets
 * Gas tính theo gas limit; block finalized sau 2 block.
 */
export const MONAD_TESTNET: ChainNetwork = {
  chainId: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: [
    'https://testnet-rpc.monad.xyz',
    'https://rpc.ankr.com/monad_testnet',
    'https://rpc-testnet.monadinfra.com',
  ],
  wsUrl: 'wss://testnet-rpc.monad.xyz',
  explorers: [
    { name: 'MonadVision', url: 'https://testnet.monadvision.com' },
    { name: 'Monadscan', url: 'https://testnet.monadscan.com' },
  ],
  faucetUrl: 'https://faucet.monad.xyz',
  blockTimeMs: 300,
  finalityBlocks: 2,
};

/** Mạng mô phỏng của Hardhat dùng khi phát triển và chạy test. */
export const HARDHAT_LOCAL: ChainNetwork = {
  chainId: 31337,
  name: 'Hardhat Local',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: ['http://127.0.0.1:8545'],
  explorers: [],
  blockTimeMs: 1000,
  finalityBlocks: 0,
};

export const SUPPORTED_NETWORKS: Readonly<Record<number, ChainNetwork>> = {
  [MONAD_TESTNET.chainId]: MONAD_TESTNET,
  [HARDHAT_LOCAL.chainId]: HARDHAT_LOCAL,
};

export function getNetwork(chainId: number): ChainNetwork | undefined {
  return SUPPORTED_NETWORKS[chainId];
}

/** Đường dẫn xem giao dịch trên explorer mặc định của mạng; `null` nếu mạng không có explorer. */
export function explorerTxUrl(chainId: number, txHash: string): string | null {
  const explorer = getNetwork(chainId)?.explorers[0];
  return explorer ? `${explorer.url}/tx/${txHash}` : null;
}

/** Đường dẫn xem địa chỉ ví/contract trên explorer mặc định của mạng. */
export function explorerAddressUrl(chainId: number, address: string): string | null {
  const explorer = getNetwork(chainId)?.explorers[0];
  return explorer ? `${explorer.url}/address/${address}` : null;
}
