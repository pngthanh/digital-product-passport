import { Wallet } from 'ethers';
import { network } from 'hardhat';
import PartyRegistryModule from '../ignition/modules/party-registry.js';

/**
 * Deploy PartyRegistry (người dùng, tổ chức, phí) rồi in ra các dòng cần chép vào .env.
 * Ví deploy là Admin và ví nhận phí; tài khoản Admin trên web phải liên kết đúng ví này.
 * Chạy: pnpm --filter @dpp/contracts deploy:local   (Hardhat node, chain 31337)
 *       pnpm --filter @dpp/contracts deploy:monad   (Monad Testnet, cần DEPLOYER_PRIVATE_KEY có MON)
 */
const LOCAL_CHAIN_ID = 31337n;

/**
 * Tăng khi PartyRegistry đổi constructor hoặc mã nguồn mà phải deploy contract mới. Mỗi phiên bản
 * có thư mục Ignition riêng nên bản cũ vẫn giữ làm hồ sơ: M2 ở `chain-10143`, M4 ở `chain-10143-v2`.
 */
const PARTY_REGISTRY_VERSION = 2;

function registrarAddress(): string {
  const key = process.env.REGISTRAR_SIGNER_PRIVATE_KEY?.trim();
  if (!key) {
    throw new Error(
      'Thiếu REGISTRAR_SIGNER_PRIVATE_KEY trong .env. Tạo khoá bằng: pnpm --filter @dpp/api registrar:new',
    );
  }
  return new Wallet(key).address;
}

const connection = await network.getOrCreate();
const { ethers, ignition } = connection;
const { chainId } = await ethers.provider.getNetwork();
const registrar = registrarAddress();
const startBlock = await ethers.provider.getBlockNumber();

// Hardhat node khởi động lại là mất trạng thái, nên mỗi lần deploy local dùng một deploymentId mới.
const deploymentId =
  chainId === LOCAL_CHAIN_ID
    ? `chain-${chainId}-${Date.now()}`
    : `chain-${chainId}-v${PARTY_REGISTRY_VERSION}`;

const { partyRegistry } = await ignition.deploy(PartyRegistryModule, {
  parameters: { PartyRegistryModule: { registrar } },
  deploymentId,
  displayUi: false,
});

const address = await partyRegistry.getAddress();
process.stdout.write(
  [
    `PartyRegistry đã deploy trên chain ${chainId} tại ${address}`,
    `Registrar (REGISTRAR_ROLE): ${registrar}`,
    `Admin (DEFAULT_ADMIN_ROLE) và Treasury: ${(await ethers.provider.getSigner()).address}`,
    '',
    'Chép vào .env:',
    `PARTY_REGISTRY_ADDRESS=${address}`,
    `PARTY_REGISTRY_DEPLOY_BLOCK=${startBlock}`,
    '',
  ].join('\n'),
);
