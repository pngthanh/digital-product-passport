import hardhatToolboxMochaEthersPlugin from '@nomicfoundation/hardhat-toolbox-mocha-ethers';
import { MONAD_TESTNET } from '@dpp/shared';
import { config as loadEnv } from 'dotenv';
import { configVariable, defineConfig } from 'hardhat/config';
import { fileURLToPath } from 'node:url';

loadEnv({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

const SOLIDITY_VERSION = '0.8.34';

/** Monad hỗ trợ opcode tới bản Fusaka (Osaka). */
const EVM_VERSION = 'osaka';

/**
 * Tuỳ chọn: dùng trình biên dịch solc có sẵn trên máy (bản native hoặc `soljson.js`)
 * khi mạng chặn binaries.soliditylang.org. Bỏ trống để Hardhat tự tải.
 */
const customCompilerPath = process.env.SOLC_PATH?.trim() || undefined;

const compilerSettings = {
  evmVersion: EVM_VERSION,
  optimizer: { enabled: true, runs: 200 },
};

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: SOLIDITY_VERSION,
        path: customCompilerPath,
        settings: compilerSettings,
      },
      production: {
        version: SOLIDITY_VERSION,
        path: customCompilerPath,
        settings: { ...compilerSettings, optimizer: { enabled: true, runs: 1000 } },
      },
    },
  },
  networks: {
    // Hardhat node chạy riêng (`pnpm --filter @dpp/contracts node`), dùng khi phát triển giao diện.
    localhost: {
      type: 'http',
      chainType: 'l1',
      url: 'http://127.0.0.1:8545',
    },
    monadTestnet: {
      type: 'http',
      chainType: 'l1',
      chainId: MONAD_TESTNET.chainId,
      url: process.env.MONAD_TESTNET_RPC_URL?.trim() || MONAD_TESTNET.rpcUrls[0]!,
      accounts: [configVariable('DEPLOYER_PRIVATE_KEY')],
    },
  },
  verify: {
    blockscout: { enabled: false },
    etherscan: {
      enabled: Boolean(process.env.ETHERSCAN_API_KEY),
      apiKey: configVariable('ETHERSCAN_API_KEY'),
    },
    sourcify: {
      enabled: true,
      apiUrl: 'https://sourcify-api-monad.blockvision.org',
    },
  },
  chainDescriptors: {
    [MONAD_TESTNET.chainId]: {
      name: 'MonadTestnet',
      blockExplorers: {
        etherscan: {
          name: 'Monadscan',
          url: 'https://testnet.monadscan.com',
          apiUrl: 'https://api.etherscan.io/v2/api',
        },
      },
    },
  },
});
