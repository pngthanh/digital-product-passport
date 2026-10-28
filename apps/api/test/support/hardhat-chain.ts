import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { ContractFactory, JsonRpcProvider } from 'ethers';

const CONTRACTS_DIR = fileURLToPath(new URL('../../../../packages/contracts/', import.meta.url));
const HARDHAT_CLI = `${CONTRACTS_DIR}node_modules/hardhat/dist/src/cli.js`;
const PARTY_REGISTRY_ARTIFACT = `${CONTRACTS_DIR}artifacts/contracts/registry/PartyRegistry.sol/PartyRegistry.json`;
const STARTUP_TIMEOUT_MS = 60_000;

export interface LocalChain {
  url: string;
  provider: JsonRpcProvider;
  /** Ví thứ i của Hardhat node (đã có sẵn ETH), dùng vai MetaMask của người dùng. */
  signer(index: number): ReturnType<JsonRpcProvider['getSigner']>;
  deployPartyRegistry(registrar: string): Promise<string>;
  mine(): Promise<void>;
  stop(): Promise<void>;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForRpc(provider: JsonRpcProvider, node: ChildProcess): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (node.exitCode !== null) {
      throw new Error(`Hardhat node dừng sớm với mã ${node.exitCode}`);
    }
    try {
      await provider.send('eth_chainId', []);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new Error('Hardhat node không sẵn sàng sau 60 giây');
}

/** Chạy một Hardhat node riêng (chain 31337) trên cổng trống, tự tắt khi test xong. */
export async function startHardhatNode(): Promise<LocalChain> {
  if (!existsSync(PARTY_REGISTRY_ARTIFACT)) {
    throw new Error('Chưa biên dịch contract. Chạy `pnpm --filter @dpp/contracts build` trước.');
  }
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  // Chạy thẳng bằng node (không qua pnpm/shell) để kill() tắt đúng tiến trình trên mọi hệ điều hành.
  const node = spawn(process.execPath, [HARDHAT_CLI, 'node', '--port', String(port)], {
    cwd: CONTRACTS_DIR,
    stdio: 'ignore',
  });
  const provider = new JsonRpcProvider(url, undefined, { staticNetwork: true, polling: false });
  await waitForRpc(provider, node);

  return {
    url,
    provider,
    signer: (index) => provider.getSigner(index),
    async deployPartyRegistry(registrar) {
      const artifact: unknown = JSON.parse(await readFile(PARTY_REGISTRY_ARTIFACT, 'utf8'));
      if (typeof artifact !== 'object' || artifact === null || !('abi' in artifact)) {
        throw new Error('Artifact PartyRegistry không hợp lệ');
      }
      const deployer = await provider.getSigner(0);
      const factory = ContractFactory.fromSolidity(artifact, deployer);
      const contract = await factory.deploy(deployer.address, registrar);
      await contract.waitForDeployment();
      return contract.getAddress();
    },
    async mine() {
      await provider.send('evm_mine', []);
    },
    async stop() {
      provider.destroy();
      node.kill();
    },
  };
}
