import { DEFAULT_ADMIN_ROLE, PARTY_REGISTRY_ABI } from '@dpp/shared';
import { Contract, getAddress, isAddress } from 'ethers';
import { network } from 'hardhat';
import ServiceTicketModule from '../ignition/modules/service-tickets.js';

/**
 * Deploy ServiceTicketManager (M7) dùng PartyRegistry, ProductPassport, WarrantyManager trong .env,
 * cấp SERVICE_CONTRACT_ROLE, rồi in các dòng cần chép vào .env.
 * Chạy: pnpm --filter @dpp/contracts deploy:services:local   (Hardhat node, chain 31337)
 *       pnpm --filter @dpp/contracts deploy:services:monad   (Monad Testnet, ví deploy cần MON)
 */
const LOCAL_CHAIN_ID = 31337n;

/** Tăng khi ServiceTicketManager đổi mà phải deploy contract mới. */
const SERVICE_TICKET_VERSION = 1;

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
const warrantyManager = addressFromEnv('WARRANTY_MANAGER_ADDRESS');

const { ethers, ignition } = await network.getOrCreate();
const { chainId } = await ethers.provider.getNetwork();
for (const [name, address] of Object.entries({ partyRegistry, productPassport, warrantyManager })) {
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
    `Ví deploy ${deployer?.address ?? '(không có)'} không có quyền Admin trên PartyRegistry nên không cấp được SERVICE_CONTRACT_ROLE. Dùng đúng ví đã deploy PartyRegistry.`,
  );
}
const startBlock = await ethers.provider.getBlockNumber();

// Hardhat node khởi động lại là mất trạng thái, nên mỗi lần deploy local dùng một deploymentId mới.
const deploymentId =
  chainId === LOCAL_CHAIN_ID
    ? `chain-${chainId}-services-${Date.now()}`
    : `chain-${chainId}-services-v${SERVICE_TICKET_VERSION}`;

const { serviceTicketManager } = await ignition.deploy(ServiceTicketModule, {
  parameters: { ServiceTicketModule: { partyRegistry, productPassport, warrantyManager } },
  deploymentId,
  displayUi: false,
});

const address = await serviceTicketManager.getAddress();
process.stdout.write(
  [
    `ServiceTicketManager v${SERVICE_TICKET_VERSION} đã deploy trên chain ${chainId} tại ${address}`,
    `Đã cấp SERVICE_CONTRACT_ROLE trên PartyRegistry ${partyRegistry}`,
    '',
    'Thêm vào .env:',
    `SERVICE_TICKET_MANAGER_ADDRESS=${address}`,
    `SERVICE_TICKET_MANAGER_DEPLOY_BLOCK=${startBlock}`,
    '',
  ].join('\n'),
);
