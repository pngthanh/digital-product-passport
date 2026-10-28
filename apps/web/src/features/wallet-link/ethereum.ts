import { getNetwork } from '@dpp/shared';
import type { Eip1193Provider } from 'ethers';
import { addEthereumChainParams, toHexChainId } from './chain-params';
import { WalletFlowError } from './wallet-errors';

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

/** MetaMask chưa biết mạng này (EIP-3326). */
const UNRECOGNIZED_CHAIN = 4902;

/** Ví trình duyệt (MetaMask) theo EIP-1193; `null` khi chưa cài hoặc đang render phía server. */
export function injectedProvider(): Eip1193Provider | null {
  return typeof window === 'undefined' ? null : (window.ethereum ?? null);
}

export function requireInjectedProvider(): Eip1193Provider {
  const provider = injectedProvider();
  if (!provider) {
    throw new WalletFlowError(
      'Trình duyệt chưa có MetaMask. Cài tiện ích MetaMask rồi tải lại trang.',
    );
  }
  return provider;
}

/** Xin quyền truy cập và trả về tài khoản đang chọn trong MetaMask. */
export async function requestAccount(ethereum: Eip1193Provider): Promise<string> {
  const accounts: unknown = await ethereum.request({ method: 'eth_requestAccounts' });
  const [account] = Array.isArray(accounts) ? accounts : [];
  if (typeof account !== 'string') {
    throw new WalletFlowError('MetaMask không trả về tài khoản nào. Mở khoá MetaMask rồi thử lại.');
  }
  return account;
}

/** Chuyển MetaMask sang đúng mạng; thêm mạng (ví dụ Monad Testnet) nếu ví chưa có. */
export async function ensureChain(ethereum: Eip1193Provider, chainId: number): Promise<void> {
  const current: unknown = await ethereum.request({ method: 'eth_chainId' });
  if (typeof current === 'string' && Number(current) === chainId) {
    return;
  }
  const network = getNetwork(chainId);
  if (!network) {
    throw new WalletFlowError(`Hệ thống chưa hỗ trợ chain ${chainId}.`);
  }
  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: toHexChainId(chainId) }],
    });
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    if (code !== UNRECOGNIZED_CHAIN) {
      throw error;
    }
    await ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [addEthereumChainParams(network)],
    });
  }
}
