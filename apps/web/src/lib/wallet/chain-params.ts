import type { ChainNetwork } from '@dpp/shared';

/** Tham số của `wallet_addEthereumChain` (EIP-3085) để MetaMask thêm mạng còn thiếu. */
export interface AddEthereumChainParameter {
  chainId: string;
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls?: string[];
}

export function toHexChainId(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

export function addEthereumChainParams(network: ChainNetwork): AddEthereumChainParameter {
  const explorers = network.explorers.map((explorer) => explorer.url);
  return {
    chainId: toHexChainId(network.chainId),
    chainName: network.name,
    nativeCurrency: { ...network.nativeCurrency },
    rpcUrls: [...network.rpcUrls],
    ...(explorers.length > 0 ? { blockExplorerUrls: explorers } : {}),
  };
}
