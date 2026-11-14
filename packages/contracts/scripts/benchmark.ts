import {
  INSPECTION_RECORD_TYPES,
  INSPECTOR_ROLE,
  inspectionDomain,
  LIFECYCLE_CONTRACT_ROLE,
  lifecycleDomain,
  MANUFACTURER_ROLE,
  ORGANIZATION_APPLICATION_TYPES,
  PRODUCT_CONTRACT_ROLE,
  PRODUCT_REGISTRATION_TYPES,
  PRODUCT_SALE_TYPES,
  partyIdFromUuid,
  partyRegistryDomain,
  productIdOf,
  productPassportDomain,
  RECALL_AUTHORIZATION_TYPES,
  RETAILER_ROLE,
  SERVICE_CENTER_ROLE,
  SERVICE_CONTRACT_ROLE,
  SERVICE_TICKET_OPENING_TYPES,
  serviceTicketDomain,
  TRANSFER_AUTHORIZATION_TYPES,
  TRANSFER_CONTRACT_ROLE,
  transferDomain,
  WALLET_BINDING_TYPES,
} from '@dpp/shared';
import {
  type BaseContract,
  formatEther,
  formatUnits,
  id,
  parseEther,
  type Signer,
  type TransactionReceipt,
  Wallet,
  ZeroAddress,
} from 'ethers';
import { network } from 'hardhat';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

/**
 * M13: đo gas, phí MON và độ trễ các hàm contract chính trên mạng đang chọn.
 *
 * Script deploy một bộ 7 contract riêng (không đụng contract của hệ thống, Indexer không thấy),
 * dùng khoá registrar tạm và ví tạm, chạy tối đa BENCH_RUNS vòng nghiệp vụ trọn vẹn, đo lô và
 * thông lượng, rồi trả MON còn dư về ví deploy. Trên mạng thật, script dừng sớm khi tổng phí sắp
 * vượt BENCH_MAX_MON. Kết quả ghi vào docs/benchmark/<mạng>.md và .json.
 *
 * Chạy: pnpm --filter @dpp/contracts bench:local   (Hardhat node đang chạy)
 *       pnpm --filter @dpp/contracts bench:monad   (in ước tính; đặt BENCH_CONFIRM=1 để chạy thật)
 * Biến tuỳ chọn: BENCH_RUNS (20), BENCH_BATCH (20), BENCH_THROUGHPUT (20), BENCH_MAX_MON (2).
 */

const LOCAL_CHAIN_ID = 31337n;
const MONAD_CHAIN_ID = 10143n;
const TTL_SECONDS = 15 * 60;
const POLL_MS = 150;
const WAIT_TIMEOUT_MS = 120_000;
/** Web cộng 10% vào gas ước lượng (Monad tính phí theo gas limit); script làm giống hệt. */
const GAS_LIMIT_MARGIN_DIVISOR = 10n;
const TRANSFER_GAS = 21_000n;
/** Ít nhất bấy nhiêu vòng trước khi giữ lại ngân sách cho phần đo lô và thông lượng. */
const MIN_ROUNDS = 3;
/** MON nạp cho người nhận chuyển nhượng: liên kết ví và nhận chuyển nhượng, chừa 35% cho Monad. */
const RECEIVER_GAS = 260_000n;

/** Gas limit đo được trên Hardhat (ước lượng + 10%), dùng để in ước tính chi phí trước khi chạy. */
const MEASURED_GAS = {
  deployAll: 9_914_000n,
  grantRoles: 200_000n,
  registerUser: 110_000n,
  organization: 241_000n,
  round: 1_365_000n,
  batchPerProduct: 135_000n,
  throughputTx: 128_000n,
} as const;
/** Monad tính truy cập lạnh và ecrecover đắt hơn Ethereum; trần ước tính cộng 50% cho các lệnh. */
const MONAD_UPPER_FACTOR = 1.5;
const IN_FLIGHT_WEI = parseEther('0.7');

function intEnv(name: string, fallback: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} phải là số nguyên từ 1 đến ${max}`);
  }
  return value;
}

const RUNS = intEnv('BENCH_RUNS', 20, 200);
const BATCH = intEnv('BENCH_BATCH', 20, 50);
const THROUGHPUT = intEnv('BENCH_THROUGHPUT', 20, 100);
const MAX_MON = process.env.BENCH_MAX_MON?.trim() || '2';

interface Sample {
  gasUsed: bigint;
  gasLimit: bigint;
  /** Phí thực trả: Monad tính theo gas limit, mạng EVM khác theo gas đã dùng. */
  feeWei: bigint;
  receiptMs: number;
  finalizedMs: number;
}

class BudgetExceeded extends Error {}

const connection = await network.getOrCreate();
const { ethers } = connection;
const provider = ethers.provider;
const [deployer] = await ethers.getSigners();
if (!deployer) throw new Error('Không có ví deploy cho mạng này.');
const { chainId } = await provider.getNetwork();
const chainIdNumber = Number(chainId);
const isLocal = chainId === LOCAL_CHAIN_ID;
const chargesGasLimit = chainId === MONAD_CHAIN_ID;
const networkSlug =
  chainId === MONAD_CHAIN_ID ? 'monad-testnet' : isLocal ? 'hardhat-local' : `chain-${chainId}`;

const samples = new Map<string, Sample[]>();
const deployments: { name: string; gasUsed: bigint; feeWei: bigint }[] = [];
const notes: string[] = [];
/** Hardhat local không giới hạn chi, trừ khi đặt BENCH_MAX_MON (để thử cơ chế dừng sớm). */
const capWei = isLocal && !process.env.BENCH_MAX_MON?.trim() ? 10n ** 30n : parseEther(MAX_MON);
let spentWei = 0n;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const mon = (wei: bigint) => Number(formatEther(wei)).toFixed(3).replace('.', ',');

function record(operation: string, sample: Sample) {
  const list = samples.get(operation) ?? [];
  list.push(sample);
  samples.set(operation, list);
}

async function maxFeePerGas(): Promise<bigint> {
  const fee = await provider.getFeeData();
  return fee.maxFeePerGas ?? fee.gasPrice ?? 0n;
}

/** Tự hỏi biên nhận mỗi 150 ms, để độ trễ không bị làm tròn theo chu kỳ hỏi mặc định của ethers. */
async function waitReceipt(hash: string): Promise<TransactionReceipt> {
  const started = performance.now();
  for (;;) {
    const receipt = await provider.getTransactionReceipt(hash);
    if (receipt) return receipt;
    if (performance.now() - started > WAIT_TIMEOUT_MS) {
      throw new Error(`Chưa có biên nhận của ${hash} sau ${WAIT_TIMEOUT_MS / 1000} giây`);
    }
    await sleep(POLL_MS);
  }
}

async function waitFinalized(blockNumber: number): Promise<void> {
  const started = performance.now();
  for (;;) {
    const block = (await provider.send('eth_getBlockByNumber', ['finalized', false])) as {
      number: string;
    } | null;
    if (block && BigInt(block.number) >= BigInt(blockNumber)) return;
    if (performance.now() - started > WAIT_TIMEOUT_MS) {
      throw new Error(`Block ${blockNumber} chưa finalized sau ${WAIT_TIMEOUT_MS / 1000} giây`);
    }
    await sleep(POLL_MS);
  }
}

function feeOf(receipt: TransactionReceipt, gasLimit: bigint): bigint {
  return (chargesGasLimit ? gasLimit : receipt.gasUsed) * receipt.gasPrice;
}

/** MON giữ lại để trả tiền dư từ các ví tạm về ví deploy. */
let sweepReserveWei = 0n;

/** Chặn trước khi gửi: tổng phí cộng phí tối đa của lệnh này không được vượt BENCH_MAX_MON. */
function guard(worstFeeWei: bigint) {
  if (spentWei + worstFeeWei + sweepReserveWei > capWei) {
    throw new BudgetExceeded(
      `đã chi ${mon(spentWei)} MON, lệnh tiếp theo có thể vượt BENCH_MAX_MON=${MAX_MON}`,
    );
  }
}

async function latestTimestamp(): Promise<bigint> {
  const block = await provider.getBlock('latest');
  return BigInt(block?.timestamp ?? Math.floor(Date.now() / 1000));
}

async function deadline(): Promise<bigint> {
  return (await latestTimestamp()) + BigInt(TTL_SECONDS);
}

/** Chuyển MON từ ví deploy; phí chuyển cũng tính vào ngân sách. */
async function fund(to: string, valueWei: bigint): Promise<void> {
  const price = await maxFeePerGas();
  guard(TRANSFER_GAS * price);
  const tx = await deployer!.sendTransaction({ to, value: valueWei, gasLimit: TRANSFER_GAS });
  const receipt = await waitReceipt(tx.hash);
  spentWei += feeOf(receipt, TRANSFER_GAS);
}

/** Nạp thêm cho ví tạm khi không đủ trả lệnh sắp gửi (nạp dư, phần thừa được trả lại cuối). */
async function ensureFunds(wallet: Signer, worstFeeWei: bigint, multiplier = 6n): Promise<void> {
  const address = await wallet.getAddress();
  if (address === deployer!.address) return;
  if ((await provider.getBalance(address)) < worstFeeWei) {
    await fund(address, worstFeeWei * multiplier);
  }
}

/** Gửi một lệnh như web (ước lượng gas + 10%), đo tới lúc có biên nhận và tới lúc finalized. */
async function measure(
  operation: string,
  contract: BaseContract,
  wallet: Signer,
  method: string,
  args: unknown[],
): Promise<TransactionReceipt> {
  const fn = contract.connect(wallet).getFunction(method);
  const estimate = await fn.estimateGas(...args);
  const gasLimit = estimate + estimate / GAS_LIMIT_MARGIN_DIVISOR;
  const worstFee = gasLimit * (await maxFeePerGas());
  guard(worstFee);
  await ensureFunds(wallet, worstFee);
  const started = performance.now();
  const tx = await fn(...args, { gasLimit });
  const receipt = await waitReceipt(tx.hash);
  const receiptMs = performance.now() - started;
  const fee = feeOf(receipt, gasLimit);
  spentWei += fee;
  if (receipt.status !== 1) {
    throw new Error(`${operation} bị revert (${tx.hash})`);
  }
  await waitFinalized(receipt.blockNumber);
  record(operation, {
    gasUsed: receipt.gasUsed,
    gasLimit,
    feeWei: fee,
    receiptMs,
    finalizedMs: performance.now() - started,
  });
  return receipt;
}

async function deploy(name: string, args: unknown[]) {
  const factory = await ethers.getContractFactory(name);
  const estimate = await provider.estimateGas(await factory.getDeployTransaction(...args));
  const gasLimit = estimate + estimate / GAS_LIMIT_MARGIN_DIVISOR;
  guard(gasLimit * (await maxFeePerGas()));
  const contract = await factory.deploy(...args, { gasLimit });
  const hash = contract.deploymentTransaction()?.hash;
  if (!hash) throw new Error(`Không gửi được giao dịch deploy ${name}`);
  const receipt = await waitReceipt(hash);
  const fee = feeOf(receipt, gasLimit);
  spentWei += fee;
  deployments.push({ name, gasUsed: receipt.gasUsed, feeWei: fee });
  return contract;
}

async function plainCall(contract: BaseContract, wallet: Signer, method: string, args: unknown[]) {
  const fn = contract.connect(wallet).getFunction(method);
  const estimate = await fn.estimateGas(...args);
  const gasLimit = estimate + estimate / GAS_LIMIT_MARGIN_DIVISOR;
  guard(gasLimit * (await maxFeePerGas()));
  const tx = await fn(...args, { gasLimit });
  spentWei += feeOf(await waitReceipt(tx.hash), gasLimit);
}

// ---------------------------------------------------------------------------
// Ước tính chi phí và xác nhận (mạng thật).
// ---------------------------------------------------------------------------

const startFee = await provider.getFeeData();
const gasPrice = startFee.gasPrice ?? startFee.maxFeePerGas ?? 0n;
const plannedGas = (factor: number) => {
  const ops =
    MEASURED_GAS.grantRoles +
    BigInt(RUNS + 5) * MEASURED_GAS.registerUser +
    4n * MEASURED_GAS.organization +
    BigInt(RUNS) * MEASURED_GAS.round +
    BigInt(BATCH) * MEASURED_GAS.batchPerProduct +
    BigInt(THROUGHPUT) * MEASURED_GAS.throughputTx;
  const transfers = BigInt(2 * (RUNS + 10)) * TRANSFER_GAS;
  return MEASURED_GAS.deployAll + (ops * BigInt(Math.round(factor * 100))) / 100n + transfers;
};
const startBalance = await provider.getBalance(deployer.address);

process.stdout.write(
  [
    `Mạng: ${networkSlug} (chain ${chainId}), ví deploy ${deployer.address}`,
    `Số dư ${mon(startBalance)} MON, giá gas ${formatUnits(gasPrice, 'gwei')} gwei`,
    `Kế hoạch: tối đa ${RUNS} vòng × 11 lệnh, lô ${BATCH} sản phẩm, thông lượng ${THROUGHPUT} giao dịch`,
    `Ước tính trọn kế hoạch: ${mon(plannedGas(1) * gasPrice)} MON nếu gas giống Hardhat, tối đa ${mon(plannedGas(MONAD_UPPER_FACTOR) * gasPrice)} MON nếu Monad đắt hơn 50%`,
    capWei === 10n ** 30n
      ? 'Hardhat local: không giới hạn chi.'
      : `Giới hạn chi BENCH_MAX_MON=${MAX_MON}: hết ngân sách thì dừng sớm, báo cáo ghi số vòng đã chạy.`,
    '',
  ].join('\n'),
);

if (!isLocal) {
  // Ngoài phần chi, ví tạm giữ tạm khoảng 0,7 MON (trả lại khi xong).
  if (startBalance < capWei + IN_FLIGHT_WEI) {
    throw new Error(
      `Ví deploy có ${mon(startBalance)} MON, cần ít nhất BENCH_MAX_MON + 0,7 MON (tiền nạp tạm cho ví tạm, được trả lại). Nhận thêm ở faucet.monad.xyz hoặc giảm BENCH_MAX_MON.`,
    );
  }
  if (process.env.BENCH_CONFIRM?.trim() !== '1') {
    process.stdout.write('Chưa chạy. Đặt BENCH_CONFIRM=1 rồi chạy lại để bắt đầu đo.\n');
    process.exit(0);
  }
}

const ephemeral: Wallet[] = [];
function newWallet(): Wallet {
  const wallet = new Wallet(Wallet.createRandom().privateKey, provider);
  ephemeral.push(wallet);
  sweepReserveWei = BigInt(ephemeral.length) * TRANSFER_GAS * gasPrice * 2n;
  return wallet;
}

interface Throughput {
  transactions: number;
  blocks: number;
  sendMs: number;
  allReceiptsMs: number;
  allFinalizedMs: number;
  tpsToReceipt: number;
  tpsToFinalized: number;
}

let roundsDone = 0;
const measured: { throughput: Throughput | null } = { throughput: null };

function meanFeeWei(operation: string): bigint {
  const list = samples.get(operation) ?? [];
  return list.length > 0
    ? list.reduce((sum, item) => sum + item.feeWei, 0n) / BigInt(list.length)
    : 0n;
}

/** Phí ước tính cho phần lô và thông lượng, tính từ phí thật của các vòng đã chạy. */
function tailEstimateWei(): bigint {
  const register = meanFeeWei('ProductPassport.registerProducts (1 sản phẩm)');
  const recall = meanFeeWei('ProductLifecycle.recallProducts (1 sản phẩm)');
  return (BigInt(BATCH) * (register * 7n + recall * 6n)) / 10n + BigInt(THROUGHPUT) * register;
}

/** Mọi phần đo; lỗi hay hết ngân sách giữa chừng thì vẫn trả MON về và ghi báo cáo phần đã đo. */
async function runPhases(): Promise<void> {
  // ---------------------------------------------------------------------------
  // Deploy bộ contract riêng cho lần đo.
  // ---------------------------------------------------------------------------

  const registrar = Wallet.createRandom();
  const registry = await deploy('PartyRegistry', [
    deployer.address,
    registrar.address,
    deployer.address,
    0n,
  ]);
  const registryAddress = await registry.getAddress();
  const warranty = await deploy('WarrantyManager', [registryAddress]);
  const warrantyAddress = await warranty.getAddress();
  const passport = await deploy('ProductPassport', [registryAddress, warrantyAddress]);
  const passportAddress = await passport.getAddress();
  const service = await deploy('ServiceTicketManager', [
    registryAddress,
    passportAddress,
    warrantyAddress,
  ]);
  const serviceAddress = await service.getAddress();
  const inspection = await deploy('InspectionRegistry', [registryAddress, passportAddress]);
  const transfer = await deploy('OwnershipTransfer', [
    registryAddress,
    passportAddress,
    serviceAddress,
  ]);
  const lifecycle = await deploy('ProductLifecycle', [
    registryAddress,
    passportAddress,
    serviceAddress,
  ]);
  for (const [role, target] of [
    [PRODUCT_CONTRACT_ROLE, passportAddress],
    [SERVICE_CONTRACT_ROLE, serviceAddress],
    [TRANSFER_CONTRACT_ROLE, await transfer.getAddress()],
    [LIFECYCLE_CONTRACT_ROLE, await lifecycle.getAddress()],
  ] as const) {
    await plainCall(registry, deployer, 'grantRole', [role, target]);
  }
  process.stdout.write(`Đã deploy 7 contract, chi ${mon(spentWei)} MON.\n`);

  const domains = {
    registry: partyRegistryDomain(chainIdNumber, registryAddress),
    passport: productPassportDomain(chainIdNumber, passportAddress),
    service: serviceTicketDomain(chainIdNumber, serviceAddress),
    inspection: inspectionDomain(chainIdNumber, await inspection.getAddress()),
    transfer: transferDomain(chainIdNumber, await transfer.getAddress()),
    lifecycle: lifecycleDomain(chainIdNumber, await lifecycle.getAddress()),
  };

  // ---------------------------------------------------------------------------
  // Ví tạm: đại diện 4 doanh nghiệp, một chủ sở hữu, mỗi vòng thêm một người nhận chuyển nhượng.
  // ---------------------------------------------------------------------------

  async function registerUser(wallet: Wallet): Promise<string> {
    const partyId = partyIdFromUuid(randomUUID());
    const value = {
      partyId,
      wallet: wallet.address,
      previousWallet: ZeroAddress,
      deadline: await deadline(),
    };
    const signature = await registrar.signTypedData(domains.registry, WALLET_BINDING_TYPES, value);
    await measure('PartyRegistry.registerUser', registry, wallet, 'registerUser', [
      partyId,
      value.deadline,
      signature,
    ]);
    return partyId;
  }

  async function organization(wallet: Wallet, representativeId: string, role: string) {
    const partyId = partyIdFromUuid(randomUUID());
    const application = {
      partyId,
      representativeId,
      role,
      profileHash: id(`ho so ${partyId}`),
      deadline: await deadline(),
    };
    const signature = await registrar.signTypedData(
      domains.registry,
      ORGANIZATION_APPLICATION_TYPES,
      application,
    );
    await measure('PartyRegistry.applyOrganization', registry, wallet, 'applyOrganization', [
      partyId,
      role,
      application.profileHash,
      application.deadline,
      signature,
    ]);
    await measure('PartyRegistry.approveOrganization', registry, deployer, 'approveOrganization', [
      partyId,
    ]);
    return partyId;
  }

  const makerWallet = newWallet();
  const shopWallet = newWallet();
  const centerWallet = newWallet();
  const inspectorWallet = newWallet();
  const ownerWallet = newWallet();
  const MAKER = await organization(makerWallet, await registerUser(makerWallet), MANUFACTURER_ROLE);
  const SHOP = await organization(shopWallet, await registerUser(shopWallet), RETAILER_ROLE);
  const CENTER = await organization(
    centerWallet,
    await registerUser(centerWallet),
    SERVICE_CENTER_ROLE,
  );
  const INSPECTOR = await organization(
    inspectorWallet,
    await registerUser(inspectorWallet),
    INSPECTOR_ROLE,
  );
  const OWNER = await registerUser(ownerWallet);
  process.stdout.write(`Đã có 4 doanh nghiệp đã duyệt và chủ sở hữu, chi ${mon(spentWei)} MON.\n`);

  // ---------------------------------------------------------------------------
  // Các vòng nghiệp vụ: người nhận liên kết ví → phát hành → giao → nhận → bán → mở, đóng phiếu sửa
  // → kiểm định → tạo, nhận chuyển nhượng → thu hồi.
  // ---------------------------------------------------------------------------

  const runTag = Date.now().toString(36).toUpperCase();

  async function registration(serials: string[]) {
    const productIds = serials.map((serial) => productIdOf(MAKER, serial));
    const value = {
      issuerId: MAKER,
      productIds,
      metadataHashes: productIds.map((productId) => id(`ho so ${productId}`)),
      warrantyMonths: productIds.map(() => 24),
      deadline: await deadline(),
    };
    const signature = await registrar.signTypedData(
      domains.passport,
      PRODUCT_REGISTRATION_TYPES,
      value,
    );
    return {
      productIds,
      args: [
        value.issuerId,
        value.productIds,
        value.metadataHashes,
        value.warrantyMonths,
        value.deadline,
        signature,
      ],
    };
  }

  async function recallArgs(productIds: string[], reason: string) {
    const value = {
      issuerId: MAKER,
      productIds,
      reasonHash: id(reason),
      deadline: await deadline(),
    };
    const signature = await registrar.signTypedData(
      domains.lifecycle,
      RECALL_AUTHORIZATION_TYPES,
      value,
    );
    return [value.productIds, value.reasonHash, value.deadline, signature];
  }

  async function round(index: number): Promise<void> {
    const serial = `BENCH-${runTag}-${String(index).padStart(4, '0')}`;
    const receiver = newWallet();
    await fund(receiver.address, RECEIVER_GAS * (await maxFeePerGas()));
    const RECEIVER = await registerUser(receiver);

    const { productIds, args } = await registration([serial]);
    const productId = productIds[0]!;
    await measure(
      'ProductPassport.registerProducts (1 sản phẩm)',
      passport,
      makerWallet,
      'registerProducts',
      args,
    );
    await measure('ProductPassport.dispatchCustody', passport, makerWallet, 'dispatchCustody', [
      productId,
      SHOP,
    ]);
    await measure(
      'ProductPassport.confirmCustodyReceipt',
      passport,
      shopWallet,
      'confirmCustodyReceipt',
      [productId],
    );

    const sale = { productId, retailerId: SHOP, buyerId: OWNER, deadline: await deadline() };
    await measure(
      'ProductPassport.sellAndActivateWarranty',
      passport,
      shopWallet,
      'sellAndActivateWarranty',
      [
        productId,
        OWNER,
        sale.deadline,
        await registrar.signTypedData(domains.passport, PRODUCT_SALE_TYPES, sale),
      ],
    );

    const opening = {
      ticketId: id(`phieu ${serial}`),
      productId,
      serviceCenterId: CENTER,
      requesterId: OWNER,
      deadline: await deadline(),
    };
    await measure('ServiceTicketManager.openTicket', service, centerWallet, 'openTicket', [
      opening.ticketId,
      productId,
      OWNER,
      opening.deadline,
      await registrar.signTypedData(domains.service, SERVICE_TICKET_OPENING_TYPES, opening),
    ]);
    await measure('ServiceTicketManager.closeTicket', service, centerWallet, 'closeTicket', [
      opening.ticketId,
      true,
      id(`bien ban ${serial}`),
    ]);

    const inspectionValue = {
      inspectionId: id(`kiem dinh ${serial}`),
      productId,
      inspectorId: INSPECTOR,
      requesterId: OWNER,
      result: 1,
      reportHash: id(`bao cao ${serial}`),
      deadline: await deadline(),
    };
    await measure(
      'InspectionRegistry.recordInspection',
      inspection,
      inspectorWallet,
      'recordInspection',
      [
        inspectionValue.inspectionId,
        productId,
        OWNER,
        inspectionValue.result,
        inspectionValue.reportHash,
        inspectionValue.deadline,
        await registrar.signTypedData(domains.inspection, INSPECTION_RECORD_TYPES, inspectionValue),
      ],
    );

    const authorization = {
      productId,
      fromPartyId: OWNER,
      toPartyId: RECEIVER,
      expiresAt: (await latestTimestamp()) + 7n * 86_400n,
      deadline: await deadline(),
    };
    const created = await measure(
      'OwnershipTransfer.createTransferRequest',
      transfer,
      ownerWallet,
      'createTransferRequest',
      [
        productId,
        RECEIVER,
        authorization.expiresAt,
        authorization.deadline,
        await registrar.signTypedData(
          domains.transfer,
          TRANSFER_AUTHORIZATION_TYPES,
          authorization,
        ),
      ],
    );
    const requested = created.logs
      .map((log) => transfer.interface.parseLog(log))
      .find((parsed) => parsed?.name === 'TransferRequested');
    if (!requested) throw new Error('Không thấy event TransferRequested');
    await measure('OwnershipTransfer.acceptTransfer', transfer, receiver, 'acceptTransfer', [
      requested.args[0],
    ]);

    await measure(
      'ProductLifecycle.recallProducts (1 sản phẩm)',
      lifecycle,
      makerWallet,
      'recallProducts',
      await recallArgs([productId], `thu hoi ${serial}`),
    );
  }

  let lastRoundWei = 0n;
  for (let index = 1; index <= RUNS; index += 1) {
    if (roundsDone > 0) {
      const reserve = roundsDone >= MIN_ROUNDS ? tailEstimateWei() : 0n;
      if (spentWei + (lastRoundWei * 12n) / 10n + reserve + sweepReserveWei > capWei) {
        notes.push(
          `Dừng sau ${roundsDone}/${RUNS} vòng để không vượt BENCH_MAX_MON=${MAX_MON} (giữ phần cho lô và thông lượng).`,
        );
        break;
      }
    }
    try {
      const before = spentWei;
      await round(index);
      lastRoundWei = spentWei - before;
      roundsDone += 1;
      process.stdout.write(`Vòng ${index}/${RUNS} xong, đã chi ${mon(spentWei)} MON.\n`);
    } catch (error) {
      if (error instanceof BudgetExceeded) {
        notes.push(`Dừng ở vòng ${index}: ${error.message}.`);
        break;
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Lô: đăng ký và thu hồi BATCH sản phẩm trong một giao dịch.
  // ---------------------------------------------------------------------------

  try {
    const serials = Array.from(
      { length: BATCH },
      (_, index) => `BENCH-${runTag}-L${String(index + 1).padStart(3, '0')}`,
    );
    const batch = await registration(serials);
    await measure(
      `ProductPassport.registerProducts (${BATCH} sản phẩm)`,
      passport,
      makerWallet,
      'registerProducts',
      batch.args,
    );
    await measure(
      `ProductLifecycle.recallProducts (${BATCH} sản phẩm)`,
      lifecycle,
      makerWallet,
      'recallProducts',
      await recallArgs(batch.productIds, `thu hoi lo ${runTag}`),
    );
  } catch (error) {
    if (!(error instanceof BudgetExceeded)) throw error;
    notes.push(`Bỏ phần đo lô: ${error.message}.`);
  }

  // ---------------------------------------------------------------------------
  // Thông lượng: THROUGHPUT giao dịch đăng ký gửi liền nhau từ một ví (nonce tăng dần).
  // ---------------------------------------------------------------------------

  try {
    const prepared = [];
    for (let index = 1; index <= THROUGHPUT; index += 1) {
      prepared.push(await registration([`BENCH-${runTag}-T${String(index).padStart(3, '0')}`]));
    }
    const fn = passport.connect(makerWallet).getFunction('registerProducts');
    const estimate = await fn.estimateGas(...prepared[0]!.args);
    const gasLimit = estimate + estimate / GAS_LIMIT_MARGIN_DIVISOR;
    const worstTotal = BigInt(THROUGHPUT) * gasLimit * (await maxFeePerGas());
    guard(worstTotal);
    await ensureFunds(makerWallet, worstTotal, 1n);
    let nonce = await provider.getTransactionCount(makerWallet.address, 'pending');
    const started = performance.now();
    const hashes: string[] = [];
    for (const item of prepared) {
      hashes.push((await fn(...item.args, { gasLimit, nonce })).hash);
      nonce += 1;
    }
    const sendMs = performance.now() - started;
    // Cùng một ví nên giao dịch có nonce cuối vào block sau cùng.
    await waitReceipt(hashes.at(-1)!);
    const allReceiptsMs = performance.now() - started;
    const receipts = await Promise.all(hashes.map((hash) => waitReceipt(hash)));
    const lastBlock = Math.max(...receipts.map((receipt) => receipt.blockNumber));
    const firstBlock = Math.min(...receipts.map((receipt) => receipt.blockNumber));
    await waitFinalized(lastBlock);
    const allFinalizedMs = performance.now() - started;
    for (const receipt of receipts) {
      spentWei += feeOf(receipt, gasLimit);
      if (receipt.status !== 1) throw new Error('Có giao dịch thông lượng bị revert');
    }
    measured.throughput = {
      transactions: THROUGHPUT,
      blocks: lastBlock - firstBlock + 1,
      sendMs,
      allReceiptsMs,
      allFinalizedMs,
      tpsToReceipt: THROUGHPUT / (allReceiptsMs / 1000),
      tpsToFinalized: THROUGHPUT / (allFinalizedMs / 1000),
    };
  } catch (error) {
    if (!(error instanceof BudgetExceeded)) throw error;
    notes.push(`Bỏ phần đo thông lượng: ${error.message}.`);
  }
}

let failure: unknown = null;
try {
  await runPhases();
} catch (error) {
  if (error instanceof BudgetExceeded) {
    notes.push(`Dừng: ${error.message}.`);
  } else {
    failure = error;
    notes.push(`Dừng vì lỗi: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ---------------------------------------------------------------------------
// Trả MON còn dư từ ví tạm về ví deploy.
// ---------------------------------------------------------------------------

let returnedWei = 0n;
const sweepPrice = await maxFeePerGas();
for (const wallet of ephemeral) {
  const balance = await provider.getBalance(wallet.address);
  const cost = TRANSFER_GAS * sweepPrice;
  if (balance > cost * 2n) {
    const tx = await wallet.sendTransaction({
      to: deployer.address,
      value: balance - cost,
      gasLimit: TRANSFER_GAS,
      maxFeePerGas: sweepPrice,
    });
    const receipt = await waitReceipt(tx.hash);
    spentWei += feeOf(receipt, TRANSFER_GAS);
    returnedWei += balance - cost;
  }
}
const endBalance = await provider.getBalance(deployer.address);

// ---------------------------------------------------------------------------
// Báo cáo.
// ---------------------------------------------------------------------------

function stats(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.length > 1
      ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
      : 0;
  const pick = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!;
  return {
    min: sorted[0]!,
    mean,
    p50: pick(0.5),
    p95: pick(0.95),
    max: sorted.at(-1)!,
    stddev: Math.sqrt(variance),
  };
}

const operations = [...samples.entries()].map(([operation, list]) => {
  const meanFee = list.reduce((sum, item) => sum + item.feeWei, 0n) / BigInt(list.length);
  return {
    operation,
    samples: list.length,
    gasUsed: stats(list.map((item) => Number(item.gasUsed))),
    gasLimit: stats(list.map((item) => Number(item.gasLimit))),
    feeMon: Number(formatEther(meanFee)),
    receiptMs: stats(list.map((item) => item.receiptMs)),
    finalizedMs: stats(list.map((item) => item.finalizedMs)),
  };
});

const report = {
  network: networkSlug,
  chainId: chainIdNumber,
  generatedAt: new Date().toISOString(),
  feeModel: chargesGasLimit ? 'gas limit × giá gas (Monad)' : 'gas đã dùng × giá gas',
  gasLimitRule: 'ước lượng + 10% (giống web)',
  plannedRuns: RUNS,
  completedRuns: roundsDone,
  batchSize: BATCH,
  gasPriceGwei: Number(formatUnits(gasPrice, 'gwei')),
  budgetMon: isLocal ? null : Number(MAX_MON),
  deployments: deployments.map((item) => ({
    name: item.name,
    gasUsed: Number(item.gasUsed),
    feeMon: Number(formatEther(item.feeWei)),
  })),
  operations,
  throughput: measured.throughput,
  feesMon: Number(formatEther(spentWei)),
  balanceChangeMon: Number(formatEther(startBalance - endBalance)),
  returnedMon: Number(formatEther(returnedWei)),
  notes,
};

const num = (value: number) => Math.round(value).toLocaleString('vi-VN');
const dec = (value: number, digits: number) => value.toFixed(digits).replace('.', ',');
const perProduct = (prefix: string) => {
  const item = operations.find((entry) => entry.operation === `${prefix} (${BATCH} sản phẩm)`);
  return item ? num(item.gasUsed.mean / BATCH) : null;
};

const markdown = [
  `# Kết quả đo hiệu năng – ${networkSlug}`,
  '',
  `Sinh tự động bởi \`packages/contracts/scripts/benchmark.ts\` lúc ${report.generatedAt}. Chain ${chainIdNumber}, giá gas ${dec(report.gasPriceGwei, 3)} gwei; phí tính theo ${report.feeModel}; gas limit = ${report.gasLimitRule}. Chạy ${roundsDone}/${RUNS} vòng nghiệp vụ. Độ trễ tính từ lúc ký và gửi giao dịch tới lúc có biên nhận, và tới lúc block chứa giao dịch được finalized (hỏi mỗi ${POLL_MS} ms).`,
  '',
  ...(notes.length > 0 ? [...notes.map((note) => `> ${note}`), ''] : []),
  '## Hàm contract',
  '',
  '| Hàm | n | Gas dùng (TB) | Gas limit (TB) | Phí TB (MON) | Biên nhận TB / p95 (ms) | Finalized TB / p95 (ms) | Lệch chuẩn finalized (ms) |',
  '| --- | --: | --: | --: | --: | --: | --: | --: |',
  ...operations.map(
    (item) =>
      `| ${item.operation} | ${item.samples} | ${num(item.gasUsed.mean)} | ${num(item.gasLimit.mean)} | ${dec(item.feeMon, 6)} | ${num(item.receiptMs.mean)} / ${num(item.receiptMs.p95)} | ${num(item.finalizedMs.mean)} / ${num(item.finalizedMs.p95)} | ${num(item.finalizedMs.stddev)} |`,
  ),
  '',
  perProduct('ProductPassport.registerProducts') === null
    ? `Lô ${BATCH} sản phẩm: không đo (hết ngân sách).`
    : `Lô ${BATCH} sản phẩm: đăng ký ${perProduct('ProductPassport.registerProducts')} gas mỗi sản phẩm, thu hồi ${perProduct('ProductLifecycle.recallProducts') ?? 'không đo'} gas mỗi sản phẩm.`,
  '',
  '## Thông lượng',
  '',
  measured.throughput
    ? `${measured.throughput.transactions} giao dịch \`registerProducts\` gửi liền nhau từ một ví, nằm trong ${measured.throughput.blocks} block: gửi xong sau ${num(measured.throughput.sendMs)} ms; đủ biên nhận sau ${num(measured.throughput.allReceiptsMs)} ms (${dec(measured.throughput.tpsToReceipt, 1)} giao dịch/giây); tất cả finalized sau ${num(measured.throughput.allFinalizedMs)} ms (${dec(measured.throughput.tpsToFinalized, 1)} giao dịch/giây).`
    : 'Không đo (hết ngân sách).',
  '',
  '## Deploy',
  '',
  '| Contract | Gas | Phí (MON) |',
  '| --- | --: | --: |',
  ...report.deployments.map(
    (item) => `| ${item.name} | ${num(item.gasUsed)} | ${dec(item.feeMon, 6)} |`,
  ),
  '',
  `Tổng phí của lần đo: ${dec(report.feesMon, 6)} MON (số dư ví deploy giảm ${dec(report.balanceChangeMon, 6)} MON; đã trả về ${dec(report.returnedMon, 6)} MON từ ví tạm).`,
  '',
].join('\n');

const outputDir = fileURLToPath(new URL('../../../docs/benchmark/', import.meta.url));
await mkdir(outputDir, { recursive: true });
await writeFile(`${outputDir}${networkSlug}.json`, `${JSON.stringify(report, null, 2)}\n`);
await writeFile(`${outputDir}${networkSlug}.md`, markdown);
process.stdout.write(
  `\nXong ${roundsDone}/${RUNS} vòng. Đã ghi docs/benchmark/${networkSlug}.md và .json. Tổng phí ${dec(report.feesMon, 6)} MON.\n`,
);
if (failure) {
  process.exitCode = 1;
  throw failure;
}
