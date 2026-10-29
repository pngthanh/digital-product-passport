import { formatMon, PARTY_REGISTRY_ABI, type PartyRegistryMethod, shortenHex } from '@dpp/shared';
import { BrowserProvider, Contract } from 'ethers';
import { ensureChain, requestAccount, requireInjectedProvider } from './ethereum';
import { WalletFlowError } from './wallet-errors';

/** Monad tính phí theo gas limit, nên chỉ cộng 10% vào số ước lượng thay vì mức dư mặc định. */
export const GAS_LIMIT_MARGIN_DIVISOR = 10n;

export interface RegistryCall {
  /** Chain hệ thống đang chạy (CHAIN_ID phía server). */
  chainId: number;
  contractAddress: string;
  /** Ví cá nhân đã liên kết của người dùng; MetaMask phải đang chọn đúng ví này. */
  wallet: string;
  method: PartyRegistryMethod;
  args: readonly unknown[];
  /** Số MON (wei) gửi kèm, ví dụ phí đăng ký doanh nghiệp. */
  value?: bigint;
}

/**
 * Gửi một giao dịch lên PartyRegistry bằng ví cá nhân trong MetaMask, ví tự trả gas.
 * Kiểm tra đúng ví, đúng mạng, đủ MON và ước lượng gas trước khi ví ký, để lỗi hiện sớm.
 */
export async function sendRegistryTransaction(call: RegistryCall): Promise<string> {
  const ethereum = requireInjectedProvider();
  const account = await requestAccount(ethereum);
  if (account.toLowerCase() !== call.wallet.toLowerCase()) {
    throw new WalletFlowError(
      `MetaMask đang chọn ví khác. Chọn ví ${shortenHex(call.wallet, 6, 4)} (ví đã liên kết với tài khoản) rồi thử lại.`,
    );
  }
  await ensureChain(ethereum, call.chainId);
  const provider = new BrowserProvider(ethereum);
  const { chainId: walletChainId } = await provider.getNetwork();
  if (Number(walletChainId) !== call.chainId) {
    throw new WalletFlowError('MetaMask đang ở mạng khác. Chọn lại đúng mạng rồi thử lại.');
  }
  const value = call.value ?? 0n;
  const balance = await provider.getBalance(account);
  if (balance <= value) {
    throw new WalletFlowError(
      `Ví cần nhiều hơn ${formatMon(value)} MON (phí cộng gas), hiện có ${formatMon(balance)} MON. Nhận MON testnet ở faucet.monad.xyz rồi thử lại.`,
    );
  }

  const signer = await provider.getSigner(account);
  const registry = new Contract(call.contractAddress, PARTY_REGISTRY_ABI, signer);
  const fn = registry.getFunction(call.method);
  // Ước lượng trước: contract revert (sai trạng thái, hết hạn giấy phép…) thì báo lỗi trước khi ví ký.
  const estimated = await fn.estimateGas(...call.args, { value });
  const tx: unknown = await fn(...call.args, {
    value,
    gasLimit: estimated + estimated / GAS_LIMIT_MARGIN_DIVISOR,
  });
  if (typeof tx !== 'object' || tx === null || !('hash' in tx) || typeof tx.hash !== 'string') {
    throw new WalletFlowError('MetaMask không trả về mã giao dịch.');
  }
  return tx.hash;
}

/** Hỏi lại API tới khi Worker ghi nhận kết quả (block finalized), quá hạn thì báo người dùng. */
export async function waitUntil(
  check: () => Promise<boolean>,
  timeoutMessage: string,
  { intervalMs = 1500, timeoutMs = 120_000 } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new WalletFlowError(timeoutMessage);
}
