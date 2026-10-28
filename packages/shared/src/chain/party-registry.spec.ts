import { Wallet, ZeroAddress, verifyTypedData } from 'ethers';
import { describe, expect, it } from 'vitest';
import {
  bindingMethod,
  partyRegistryDomain,
  WALLET_BINDING_TYPES,
  type WalletBinding,
  walletBindingDigest,
} from './party-registry.js';

const REGISTRY = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const registrar = new Wallet(`0x${'11'.repeat(32)}`);

const binding: WalletBinding = {
  partyId: `0x${'0'.repeat(32)}${'ab'.repeat(16)}`,
  wallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  previousWallet: ZeroAddress,
  deadline: 1_900_000_000n,
};

describe('Giấy phép gắn ví EIP-712', () => {
  it('chữ ký của registrar khôi phục đúng địa chỉ registrar', async () => {
    const domain = partyRegistryDomain(31337, REGISTRY);
    const signature = await registrar.signTypedData(domain, WALLET_BINDING_TYPES, binding);
    expect(verifyTypedData(domain, WALLET_BINDING_TYPES, binding, signature)).toBe(
      registrar.address,
    );
  });

  it('digest phụ thuộc chain và contract, chống dùng lại giấy phép ở mạng khác', () => {
    const local = walletBindingDigest(31337, REGISTRY, binding);
    expect(walletBindingDigest(10143, REGISTRY, binding)).not.toBe(local);
    expect(walletBindingDigest(31337, ZeroAddress, binding)).not.toBe(local);
  });

  it('chọn registerUser khi chưa có ví trước đó, rotateWallet khi có', () => {
    expect(bindingMethod(binding)).toBe('registerUser');
    expect(bindingMethod({ previousWallet: registrar.address })).toBe('rotateWallet');
  });
});
