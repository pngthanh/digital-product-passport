import { DEFAULT_ADMIN_ROLE, PARTY_REGISTRY_ABI } from '@dpp/shared';
import { Contract, getAddress, isAddress } from 'ethers';
import { network } from 'hardhat';
import ProductPassportModule from '../ignition/modules/product-passport.js';

/**
 * Deploy WarrantyManager và ProductPassport (M6, phiên bản 2) trỏ tới PartyRegistry trong .env, cấp
 * PRODUCT_CONTRACT_ROLE cho ProductPassport, rồi in các dòng cần chép vào .env.
 * Chạy: pnpm --filter @dpp/contracts deploy:products:local   (Hardhat node, chain 31337)
 *       pnpm --filter @dpp/contracts deploy:products:monad   (Monad Testnet, ví deploy cần MON)
 */
const LOCAL_CHAIN_ID = 31337n;

/**
 * Tăng khi ProductPassport đổi constructor hoặc mã nguồn mà phải deploy contract mới; mỗi phiên bản
 * có thư mục Ignition riêng (`chain-10143-products-v1`, ...) nên bản cũ vẫn giữ làm hồ sơ.
 */
const PRODUCT_PASSPORT_VERSION = 2;

const registryAddress = process.env.PARTY_REGISTRY_ADDRESS?.trim();
if (!registryAddress || !isAddress(registryAddress)) {
  throw new Error(
    'Thiếu hoặc sai PARTY_REGISTRY_ADDRESS trong .env. Deploy PartyRegistry trước (deploy:local hoặc deploy:monad).',
  );
}

const { ethers, ignition } = await network.getOrCreate();
const { chainId } = await ethers.provider.getNetwork();
if ((await ethers.provider.getCode(registryAddress)) === '0x') {
  throw new Error(
    `Không có contract tại PARTY_REGISTRY_ADDRESS=${registryAddress} trên chain ${chainId}. Kiểm tra .env và mạng.`,
  );
}
const [deployer] = await ethers.getSigners();
const registry = new Contract(registryAddress, PARTY_REGISTRY_ABI, ethers.provider);
if (!deployer || !(await registry.getFunction('hasRole')(DEFAULT_ADMIN_ROLE, deployer.address))) {
  throw new Error(
    `Ví deploy ${deployer?.address ?? '(không có)'} không có quyền Admin trên PartyRegistry nên không cấp được PRODUCT_CONTRACT_ROLE. Dùng đúng ví đã deploy PartyRegistry.`,
  );
}
const startBlock = await ethers.provider.getBlockNumber();

// Hardhat node khởi động lại là mất trạng thái, nên mỗi lần deploy local dùng một deploymentId mới.
const deploymentId =
  chainId === LOCAL_CHAIN_ID
    ? `chain-${chainId}-products-${Date.now()}`
    : `chain-${chainId}-products-v${PRODUCT_PASSPORT_VERSION}`;

const { productPassport, warrantyManager } = await ignition.deploy(ProductPassportModule, {
  parameters: { ProductPassportModule: { partyRegistry: getAddress(registryAddress) } },
  deploymentId,
  displayUi: false,
});

const address = await productPassport.getAddress();
const warrantyAddress = await warrantyManager.getAddress();
process.stdout.write(
  [
    `ProductPassport v${PRODUCT_PASSPORT_VERSION} đã deploy trên chain ${chainId} tại ${address}`,
    `WarrantyManager tại ${warrantyAddress}`,
    `Dùng PartyRegistry: ${getAddress(registryAddress)} (đã cấp PRODUCT_CONTRACT_ROLE cho ProductPassport)`,
    '',
    'Sửa trong .env (thay giá trị cũ, không thêm dòng trùng):',
    `PRODUCT_PASSPORT_ADDRESS=${address}`,
    `PRODUCT_PASSPORT_DEPLOY_BLOCK=${startBlock}`,
    `WARRANTY_MANAGER_ADDRESS=${warrantyAddress}`,
    '',
  ].join('\n'),
);
