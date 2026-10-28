import { HARDHAT_LOCAL, MONAD_TESTNET } from '@dpp/shared';
import { makeError } from 'ethers';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { addEthereumChainParams } from './chain-params';
import { describeWalletError, WalletFlowError } from './wallet-errors';

describe('addEthereumChainParams', () => {
  it('Monad Testnet: chain ID dạng hex, MON 18 chữ số, có explorer', () => {
    expect(addEthereumChainParams(MONAD_TESTNET)).toEqual({
      chainId: '0x279f',
      chainName: 'Monad Testnet',
      nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
      rpcUrls: MONAD_TESTNET.rpcUrls,
      blockExplorerUrls: ['https://testnet.monadvision.com', 'https://testnet.monadscan.com'],
    });
  });

  it('Hardhat local không có explorer thì bỏ trường này', () => {
    const params = addEthereumChainParams(HARDHAT_LOCAL);
    expect(params.chainId).toBe('0x7a69');
    expect(params).not.toHaveProperty('blockExplorerUrls');
  });
});

describe('describeWalletError', () => {
  it('người dùng từ chối trong MetaMask', () => {
    expect(
      describeWalletError(
        makeError('rejected', 'ACTION_REJECTED', { action: 'signMessage', reason: 'rejected' }),
      ),
    ).toContain('từ chối');
    expect(describeWalletError({ code: 4001, message: 'User rejected' })).toContain('từ chối');
  });

  it('không đủ MON trả gas', () => {
    expect(
      describeWalletError(makeError('funds', 'INSUFFICIENT_FUNDS', { transaction: {} })),
    ).toContain('faucet');
  });

  it('dịch custom error của PartyRegistry', () => {
    const error = makeError('revert', 'CALL_EXCEPTION', {
      action: 'estimateGas',
      data: '0x',
      reason: null,
      transaction: { to: null, data: '0x' },
      invocation: null,
      revert: { name: 'WalletAlreadyUsed', signature: 'WalletAlreadyUsed(address)', args: [] },
    });
    expect(describeWalletError(error)).toContain('đã từng được liên kết');
  });

  it('giữ nguyên thông báo của API và của luồng liên kết ví', () => {
    expect(
      describeWalletError(new ApiError(409, 'Ví này đã từng…', 'WALLET_ALREADY_USED', {})),
    ).toBe('Ví này đã từng…');
    expect(describeWalletError(new WalletFlowError('Chưa cài MetaMask'))).toBe('Chưa cài MetaMask');
  });

  it('lỗi lạ có thông báo chung', () => {
    expect(describeWalletError(new Error('boom'))).toContain('Thử lại');
  });
});
