import { DEFAULT_ADMIN_ROLE, PARTY_REGISTRY_ABI } from '@dpp/shared';
import { Contract, getAddress, isAddress } from 'ethers';
import { network } from 'hardhat';
import ProductLifecycleModule from '../ignition/modules/lifecycle.js';

/**
 * Deploy ProductLifecycle (M10) dùng PartyRegistry, ProductPassport, ServiceTicketManager trong .env,
 * cấp LIFECYCLE_CONTRACT_ROLE, rồi in các dòng cần chép vào .env.
 * Chạy: pnpm --filter @dpp/contracts deploy:lifecycle:local   (Hardhat node, chain 31337)
 *       pnpm --filter @dpp/contracts deploy:lifecycle:monad   (Monad Testnet, ví deploy cần MON)
 */
const LOCAL_CHAIN_ID = 31337n;

/** Tăng khi ProductLifecycle đổi mà phải deploy contract mới. */
const PRODUCT_LIFECYCLE_VERSION = 1;

function addressFromEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || !isAddress(value)) {
    throw new Error(
      `Thiếu hoặc sai ${name} trong .env. Deploy PartyRegistry, ProductPassport và ServiceTicketManager trước.`,
    );
  }
  return getAddress(value);
}

const partyRegistry = addressFromEnv('PARTY_REGISTRY_ADDRESS');
const productPassport = addressFromEnv('PRODUCT_PASSPORT_ADDRESS');
const serviceTicketManager = addressFromEnv('SERVICE_TICKET_MANAGER_ADDRESS');

const { ethers, ignition } = await network.getOrCreate();
const { chainId } = await ethers.provider.getNetwork();
for (const [name, address] of Object.entries({
  partyRegistry,
  productPassport,
  serviceTicketManager,
})) {
  if ((await ethers.provider.getCode(address)) === '0x') {
    throw new Error(
      `Không có contract ${name} tại ${address} trên chain ${chainId}. Kiểm tra .env và mạng.`,
    );
  }
}
const [deployer] = await ethers.getSigners();
const registry = new Contract(partyRegistry, PARTY_REGISTRY_ABI, ethers.provider);
if (!deployer || !(await registry.getFunction('hasRole')(DEFAULT_ADMIN_ROLE, deployer.address))) {
  throw new Error(
    `Ví deploy ${deployer?.address ?? '(không có)'} không có quyền Admin trên PartyRegistry nên không cấp được LIFECYCLE_CONTRACT_ROLE. Dùng đúng ví đã deploy PartyRegistry.`,
  );
}
const startBlock = await ethers.provider.getBlockNumber();

// Hardhat node khởi động lại là mất trạng thái, nên mỗi lần deploy local dùng một deploymentId mới.
const deploymentId =
  chainId === LOCAL_CHAIN_ID
    ? `chain-${chainId}-lifecycle-${Date.now()}`
    : `chain-${chainId}-lifecycle-v${PRODUCT_LIFECYCLE_VERSION}`;

const { productLifecycle } = await ignition.deploy(ProductLifecycleModule, {
  parameters: {
    ProductLifecycleModule: { partyRegistry, productPassport, serviceTicketManager },
  },
  deploymentId,
  displayUi: false,
});

const address = await productLifecycle.getAddress();
process.stdout.write(
  [
    `ProductLifecycle v${PRODUCT_LIFECYCLE_VERSION} đã deploy trên chain ${chainId} tại ${address}`,
    `Đã cấp LIFECYCLE_CONTRACT_ROLE trên PartyRegistry ${partyRegistry}`,
    '',
    'Thêm vào .env:',
    `PRODUCT_LIFECYCLE_ADDRESS=${address}`,
    `PRODUCT_LIFECYCLE_DEPLOY_BLOCK=${startBlock}`,
    '',
  ].join('\n'),
);
