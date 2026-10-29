import { DEFAULT_ADMIN_ROLE } from '@dpp/shared';
import { getAddress, isAddress } from 'ethers';
import { network } from 'hardhat';

/**
 * Ví deploy (đang giữ DEFAULT_ADMIN_ROLE) cấp quyền Admin PartyRegistry cho một ví khác,
 * ví dụ ví MetaMask mà tài khoản Admin trên web đã liên kết.
 * Chạy (PowerShell): $env:NEW_ADMIN_WALLET="0x..."; pnpm --filter @dpp/contracts admin-role:monad
 */
function requiredAddress(name: string, hint: string): string {
  const value = process.env[name]?.trim();
  if (!value || !isAddress(value)) {
    throw new Error(`Thiếu hoặc sai ${name}. ${hint}`);
  }
  return getAddress(value);
}

const registryAddress = requiredAddress(
  'PARTY_REGISTRY_ADDRESS',
  'Kiểm tra dòng PARTY_REGISTRY_ADDRESS trong .env.',
);
const newAdmin = requiredAddress(
  'NEW_ADMIN_WALLET',
  'Đặt địa chỉ ví sẽ làm Admin, ví dụ: $env:NEW_ADMIN_WALLET="0x..."',
);

const { ethers } = await network.getOrCreate();
const [deployer] = await ethers.getSigners();
if (!deployer) {
  throw new Error('Không có ví ký giao dịch. Kiểm tra DEPLOYER_PRIVATE_KEY trong keystore.');
}
const registry = await ethers.getContractAt('PartyRegistry', registryAddress, deployer);

if (await registry.getFunction('hasRole')(DEFAULT_ADMIN_ROLE, newAdmin)) {
  process.stdout.write(`Ví ${newAdmin} đã có quyền Admin trên PartyRegistry, không cần làm gì.\n`);
} else {
  if (!(await registry.getFunction('hasRole')(DEFAULT_ADMIN_ROLE, deployer.address))) {
    throw new Error(
      `Ví ${deployer.address} không có quyền Admin trên PartyRegistry ${registryAddress}, ` +
        'nên không cấp quyền được. Dùng đúng ví đã deploy contract.',
    );
  }
  const tx = await registry.getFunction('grantRole')(DEFAULT_ADMIN_ROLE, newAdmin);
  await tx.wait();
  process.stdout.write(
    [
      `Đã cấp quyền Admin PartyRegistry cho ${newAdmin}.`,
      `Ví cấp: ${deployer.address}. Mã giao dịch: ${tx.hash}`,
      'Tải lại trang Quản trị. Muốn phí duyệt đơn về ví mới thì bấm "Đổi ví Treasury" trên trang đó.',
      '',
    ].join('\n'),
  );
}
