import {
  PARTY_REGISTRY_ABI,
  type WalletLinkAuthorization,
  type WalletLinkPurpose,
} from '@dpp/shared';
import { BrowserProvider, Contract, type JsonRpcSigner } from 'ethers';
import { apiRequest } from '@/lib/api-client';
import {
  identitySnapshotSchema,
  walletLinkAuthorizationSchema,
  walletLinkChallengeSchema,
  walletSummarySchema,
} from '../auth/identity.schema';
import { ensureChain, requestAccount, requireInjectedProvider } from '@/lib/wallet/ethereum';
import { GAS_LIMIT_MARGIN_DIVISOR } from '@/lib/wallet/send-registry-transaction';
import { WalletFlowError } from '@/lib/wallet/wallet-errors';

export const LINK_STEPS = ['connect', 'sign', 'send', 'confirm'] as const;
export type LinkStep = (typeof LINK_STEPS)[number];
const CONFIRM_POLL_MS = 1500;
const CONFIRM_TIMEOUT_MS = 120_000;

export interface LinkWalletOptions {
  /** Chain hệ thống đang chạy (CHAIN_ID phía server). */
  chainId: number;
  purpose: WalletLinkPurpose;
  /** Bắt buộc khi xoay ví. */
  password?: string;
  onStep: (step: LinkStep) => void;
}

/**
 * ACC-03/04 phía trình duyệt: MetaMask ký EIP-4361 để chứng minh sở hữu ví, API cấp giấy phép
 * EIP-712, rồi chính ví đó gửi registerUser/rotateWallet và tự trả gas. Hoàn tất khi API báo
 * ví đã ACTIVE (Worker thấy event đã finalized).
 */
export async function linkWallet({
  chainId,
  purpose,
  password,
  onStep,
}: LinkWalletOptions): Promise<void> {
  const ethereum = requireInjectedProvider();
  onStep('connect');
  const account = await requestAccount(ethereum);
  await ensureChain(ethereum, chainId);
  const provider = new BrowserProvider(ethereum);
  const signer = await provider.getSigner(account);

  onStep('sign');
  const challenge = await apiRequest('/me/wallet-links/challenge', walletLinkChallengeSchema, {
    method: 'POST',
    body: { address: signer.address, purpose },
  });
  const signature = await signer.signMessage(challenge.message);
  const authorization = await apiRequest(
    '/me/wallet-links/authorize',
    walletLinkAuthorizationSchema,
    {
      method: 'POST',
      body: { challengeToken: challenge.challengeToken, signature, password },
    },
  );

  onStep('send');
  // Giấy phép chỉ hợp lệ trên chain của contract; kiểm tra lại vì người dùng có thể đổi mạng giữa chừng.
  const { chainId: walletChainId } = await provider.getNetwork();
  if (Number(walletChainId) !== authorization.chainId) {
    throw new WalletFlowError(
      'MetaMask đã chuyển sang mạng khác trong lúc liên kết. Chọn lại đúng mạng rồi thử lại.',
    );
  }
  const txHash = await sendBindingTransaction(provider, signer, authorization);

  onStep('confirm');
  await apiRequest(`/me/wallet-links/${authorization.walletId}/transaction`, walletSummarySchema, {
    method: 'POST',
    body: { txHash },
  });
  await waitUntilActive(authorization.wallet);
}

async function sendBindingTransaction(
  provider: BrowserProvider,
  signer: JsonRpcSigner,
  authorization: WalletLinkAuthorization,
): Promise<string> {
  if ((await provider.getBalance(signer.address)) === 0n) {
    throw new WalletFlowError(
      'Ví chưa có MON để trả gas. Nhận MON testnet miễn phí ở faucet.monad.xyz rồi thử lại.',
    );
  }
  const registry = new Contract(authorization.contractAddress, PARTY_REGISTRY_ABI, signer);
  const method = registry.getFunction(authorization.method);
  const deadline = BigInt(authorization.deadline);
  const args =
    authorization.method === 'registerUser'
      ? [authorization.partyId, deadline, authorization.signature]
      : [authorization.partyId, authorization.previousWallet, deadline, authorization.signature];
  // Ước lượng trước: contract revert (ví đã dùng, giấy phép hết hạn…) thì báo lỗi trước khi ví ký.
  const estimated = await method.estimateGas(...args);
  const tx: unknown = await method(...args, {
    gasLimit: estimated + estimated / GAS_LIMIT_MARGIN_DIVISOR,
  });
  if (typeof tx !== 'object' || tx === null || !('hash' in tx) || typeof tx.hash !== 'string') {
    throw new WalletFlowError('MetaMask không trả về mã giao dịch.');
  }
  return tx.hash;
}

async function waitUntilActive(wallet: string): Promise<void> {
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const identity = await apiRequest('/auth/me', identitySnapshotSchema);
    const linked = identity.wallets.find(
      (candidate) => candidate.address.toLowerCase() === wallet.toLowerCase(),
    );
    if (linked?.status === 'ACTIVE') {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, CONFIRM_POLL_MS));
  }
  throw new WalletFlowError(
    'Giao dịch đã được gửi nhưng hệ thống chưa thấy xác nhận. Tải lại trang sau ít phút.',
  );
}
