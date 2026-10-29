import { getAddress, isAddress } from 'ethers';
import { network } from 'hardhat';
import ProductPassportModule from '../ignition/modules/product-passport.js';

/**
 * Deploy ProductPassport (M5) trỏ tới PartyRegistry trong .env, rồi in các dòng cần chép vào .env.
 * Chạy: pnpm --filter @dpp/contracts deploy:products:local   (Hardhat node, chain 31337)
 *       pnpm --filter @dpp/contracts deploy:products:monad   (Monad Testnet, ví deploy cần MON)
 */
const LOCAL_CHAIN_ID = 31337n;

/**
 * Tăng khi ProductPassport đổi constructor hoặc mã nguồn mà phải deploy contract mới; mỗi phiên bản
 * có thư mục Ignition riêng (`chain-10143-products-v1`, ...) nên bản cũ vẫn giữ làm hồ sơ.
 */
const PRODUCT_PASSPORT_VERSION = 1;

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
const startBlock = await ethers.provider.getBlockNumber();

// Hardhat node khởi động lại là mất trạng thái, nên mỗi lần deploy local dùng một deploymentId mới.
const deploymentId =
  chainId === LOCAL_CHAIN_ID
    ? `chain-${chainId}-products-${Date.now()}`
    : `chain-${chainId}-products-v${PRODUCT_PASSPORT_VERSION}`;

const { productPassport } = await ignition.deploy(ProductPassportModule, {
  parameters: { ProductPassportModule: { partyRegistry: getAddress(registryAddress) } },
  deploymentId,
  displayUi: false,
});

const address = await productPassport.getAddress();
process.stdout.write(
  [
    `ProductPassport đã deploy trên chain ${chainId} tại ${address}`,
    `Dùng PartyRegistry: ${getAddress(registryAddress)}`,
    '',
    'Chép vào .env:',
    `PRODUCT_PASSPORT_ADDRESS=${address}`,
    `PRODUCT_PASSPORT_DEPLOY_BLOCK=${startBlock}`,
    '',
  ].join('\n'),
);
