import { Contract, getAddress, isAddress } from 'ethers';
import { network } from 'hardhat';
import InspectionModule from '../ignition/modules/inspections.js';

/**
 * Deploy InspectionRegistry (M8) dùng PartyRegistry, ProductPassport trong .env rồi in các dòng cần
 * chép vào .env. Không cần quyền Admin: contract chỉ đọc hai contract kia.
 * Chạy: pnpm --filter @dpp/contracts deploy:inspections:local   (Hardhat node, chain 31337)
 *       pnpm --filter @dpp/contracts deploy:inspections:monad   (Monad Testnet, ví deploy cần MON)
 */
const LOCAL_CHAIN_ID = 31337n;

/** Tăng khi InspectionRegistry đổi mà phải deploy contract mới. */
const INSPECTION_REGISTRY_VERSION = 1;

function addressFromEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || !isAddress(value)) {
    throw new Error(
      `Thiếu hoặc sai ${name} trong .env. Deploy PartyRegistry và ProductPassport trước.`,
    );
  }
  return getAddress(value);
}

const partyRegistry = addressFromEnv('PARTY_REGISTRY_ADDRESS');
const productPassport = addressFromEnv('PRODUCT_PASSPORT_ADDRESS');

const { ethers, ignition } = await network.getOrCreate();
const { chainId } = await ethers.provider.getNetwork();
for (const [name, address] of Object.entries({ partyRegistry, productPassport })) {
  if ((await ethers.provider.getCode(address)) === '0x') {
    throw new Error(
      `Không có contract ${name} tại ${address} trên chain ${chainId}. Kiểm tra .env và mạng.`,
    );
  }
}
// ProductPassport phải trỏ đúng PartyRegistry, nếu không quyền đơn vị kiểm định sẽ lệch.
const passport = new Contract(
  productPassport,
  ['function registry() view returns (address)'],
  ethers.provider,
);
if (getAddress(await passport.getFunction('registry')()) !== partyRegistry) {
  throw new Error(
    'ProductPassport trong .env không dùng PARTY_REGISTRY_ADDRESS. Kiểm tra lại .env.',
  );
}
const startBlock = await ethers.provider.getBlockNumber();

// Hardhat node khởi động lại là mất trạng thái, nên mỗi lần deploy local dùng một deploymentId mới.
const deploymentId =
  chainId === LOCAL_CHAIN_ID
    ? `chain-${chainId}-inspections-${Date.now()}`
    : `chain-${chainId}-inspections-v${INSPECTION_REGISTRY_VERSION}`;

const { inspectionRegistry } = await ignition.deploy(InspectionModule, {
  parameters: { InspectionModule: { partyRegistry, productPassport } },
  deploymentId,
  displayUi: false,
});

const address = await inspectionRegistry.getAddress();
process.stdout.write(
  [
    `InspectionRegistry v${INSPECTION_REGISTRY_VERSION} đã deploy trên chain ${chainId} tại ${address}`,
    '',
    'Thêm vào .env:',
    `INSPECTION_REGISTRY_ADDRESS=${address}`,
    `INSPECTION_REGISTRY_DEPLOY_BLOCK=${startBlock}`,
    '',
  ].join('\n'),
);
