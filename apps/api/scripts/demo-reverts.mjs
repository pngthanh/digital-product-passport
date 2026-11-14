// M13: minh hoạ bước 9, 11, 12 của kịch bản demo ở tầng Smart Contract. Gọi thử (eth_call, không gửi
// giao dịch, không tốn MON) đúng các lệnh bị cấm rồi in lỗi contract trả về:
//   - Người dùng A tạo yêu cầu chuyển nhượng thứ hai khi yêu cầu cho B còn chờ → TransferAlreadyActive
//   - A tạo yêu cầu sau khi B đã nhận sản phẩm → NotProductOwner
//   - Tài khoản giả mở phiếu sửa chữa → NotAuthorizedServiceCenter
// Dùng: pnpm --filter @dpp/api demo:reverts <mã công khai>
// Hardhat local mặc định A là ví #4, tài khoản giả là ví #6. Trên Monad Testnet đặt
// DEMO_OWNER_ADDRESS và DEMO_FAKE_ADDRESS bằng địa chỉ ví MetaMask của hai tài khoản đó.
import { OWNERSHIP_TRANSFER_ABI, SERVICE_TICKET_MANAGER_ABI } from '@dpp/shared';
import { config } from 'dotenv';
import { Interface, id, JsonRpcProvider } from 'ethers';
import { fileURLToPath } from 'node:url';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = (process.env.API_INTERNAL_URL?.trim() || 'http://localhost:4000/api/v1').replace(
  /\/$/,
  '',
);
const RPC = process.env.RPC_URL?.trim() || 'http://127.0.0.1:8545';
const HARDHAT_OWNER = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';
const HARDHAT_FAKE = '0x976EA74026E726554dB657fA54763abd0C3a0aa9';
const DUMMY_SIGNATURE = `0x${'00'.repeat(65)}`;

const EXPLAIN = {
  TransferAlreadyActive: 'Contract từ chối: sản phẩm đang có một yêu cầu chuyển nhượng chưa đóng.',
  NotProductOwner: 'Contract từ chối: ví này không còn là chủ sở hữu sản phẩm.',
  ProductNotSold:
    'Contract từ chối: sản phẩm không ở trạng thái đã bán (có thể đã thu hồi hoặc báo mất).',
  NotAuthorizedServiceCenter:
    'Contract từ chối: ví này không thuộc trung tâm bảo hành đã được duyệt.',
  InvalidAuthorization: 'Qua hết các kiểm tra quyền, chỉ dừng ở chữ ký giấy phép giả của script.',
};

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const code = process.argv[2]?.trim().toUpperCase();
if (!code) fail('Dùng: pnpm --filter @dpp/api demo:reverts <mã công khai của sản phẩm>');

async function getJson(path) {
  const response = await fetch(`${API}${path}`);
  if (!response.ok)
    fail(`GET ${path} → ${response.status}. API đang chạy và mã sản phẩm đúng chưa?`);
  return response.json();
}

const passport = await getJson(`/public/products/${code}`);
const verification = await getJson(`/public/products/${code}/verification`);
const productId = passport.proof?.productId;
const transferAddress = verification.contracts?.ownershipTransfer;
const ticketAddress = verification.contracts?.serviceTicketManager;
if (!productId || !transferAddress || !ticketAddress) {
  fail('Sản phẩm chưa lên chain, hoặc API chưa cấu hình OwnershipTransfer / ServiceTicketManager.');
}

const provider = new JsonRpcProvider(RPC, undefined, { polling: false });
const { chainId } = await provider.getNetwork();
const local = chainId === 31337n;
const owner = process.env.DEMO_OWNER_ADDRESS?.trim() || (local ? HARDHAT_OWNER : '');
const fake = process.env.DEMO_FAKE_ADDRESS?.trim() || (local ? HARDHAT_FAKE : '');
if (!owner || !fake) fail('Trên mạng thật, đặt DEMO_OWNER_ADDRESS và DEMO_FAKE_ADDRESS.');

/** Gọi thử như ví `from`; trả tên lỗi contract, hoặc null nếu lệnh không bị từ chối. */
async function tryCall(from, to, abi, method, args) {
  const contractInterface = new Interface(abi);
  try {
    await provider.call({ from, to, data: contractInterface.encodeFunctionData(method, args) });
    return null;
  } catch (error) {
    const data = error?.data ?? error?.info?.error?.data;
    const parsed = typeof data === 'string' ? contractInterface.parseError(data) : null;
    return parsed?.name ?? (error instanceof Error ? error.message : String(error));
  }
}

const latest = await provider.getBlock('latest');
const now = BigInt(latest?.timestamp ?? Math.floor(Date.now() / 1000));
const anotherParty = id('tai khoan khac trong demo');

process.stdout.write(
  `Sản phẩm ${passport.serialNumber} (${passport.productState}), chain ${chainId}\n\n`,
);

const transfer = await tryCall(
  owner,
  transferAddress,
  OWNERSHIP_TRANSFER_ABI,
  'createTransferRequest',
  [productId, anotherParty, now + 86_400n, now + 900n, DUMMY_SIGNATURE],
);
process.stdout.write(
  [
    `Bước 9 / 11 – ví ${owner} tạo thêm yêu cầu chuyển nhượng cho tài khoản khác:`,
    `  Lỗi contract: ${transfer ?? 'không bị từ chối'}`,
    `  ${EXPLAIN[transfer] ?? 'Kiểm tra lại thứ tự các bước demo.'}`,
    '',
  ].join('\n'),
);

const ticket = await tryCall(fake, ticketAddress, SERVICE_TICKET_MANAGER_ABI, 'openTicket', [
  id(`phieu gia ${Date.now()}`),
  productId,
  anotherParty,
  now + 900n,
  DUMMY_SIGNATURE,
]);
process.stdout.write(
  [
    `Bước 12 – tài khoản giả ${fake} mở phiếu sửa chữa:`,
    `  Lỗi contract: ${ticket ?? 'không bị từ chối'}`,
    `  ${EXPLAIN[ticket] ?? 'Ví này có quyền trung tâm bảo hành? Dùng ví của một tài khoản thường.'}`,
    '',
  ].join('\n'),
);
