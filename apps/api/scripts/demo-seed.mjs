// M13: dựng sẵn bước 1–6 của kịch bản demo (Mục 22 tài liệu phân tích) trên Hardhat local, đi qua
// đúng API và contract như khi bấm trên web: ví Hardhat #0–#6 đóng vai MetaMask của từng người.
// Sau khi chạy, người trình bày làm tiếp bước 7–13 trên web (xem docs/demo-kich-ban.md).
//
// Chỉ chạy với chain 31337 và CSDL vừa làm sạch. Mật khẩu chung của các tài khoản demo lấy từ biến
// môi trường DEMO_PASSWORD, không ghi trong mã nguồn.
// Dùng (PowerShell): $env:DEMO_PASSWORD="<mật khẩu>"; pnpm --filter @dpp/api demo:seed
import {
  PARTY_REGISTRY_ABI,
  PRODUCT_PASSPORT_ABI,
  partyIdFromUuid,
  SERVICE_TICKET_MANAGER_ABI,
} from '@dpp/shared';
import { config } from 'dotenv';
import { Contract, JsonRpcProvider } from 'ethers';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const LOCAL_CHAIN_ID = 31337n;
const API = (process.env.API_INTERNAL_URL?.trim() || 'http://localhost:4000/api/v1').replace(
  /\/$/,
  '',
);
const WEB = (
  process.env.PUBLIC_WEB_URL?.trim() ||
  process.env.WEB_ORIGIN?.trim() ||
  'http://localhost:3000'
).replace(/\/$/, '');
const ORIGIN = process.env.WEB_ORIGIN?.trim() || 'http://localhost:3000';
const RPC = process.env.RPC_URL?.trim() || 'http://127.0.0.1:8545';
const PASSWORD = process.env.DEMO_PASSWORD ?? '';
const WAIT_MS = 120_000;

const PEOPLE = {
  admin: { account: 0, email: 'admin@demo.dpp.vn', fullName: 'Quản trị viên' },
  maker: { account: 1, email: 'sanxuat@abc.demo.vn', fullName: 'Phạm Minh Sản' },
  shop: { account: 2, email: 'cuahang@abc.demo.vn', fullName: 'Lê Thu Hà' },
  center: { account: 3, email: 'baohanh@abc.demo.vn', fullName: 'Võ Đức Kỹ' },
  userA: { account: 4, email: 'nguoidung.a@demo.dpp.vn', fullName: 'Nguyễn Văn A' },
  userB: { account: 5, email: 'nguoimua.b@demo.dpp.vn', fullName: 'Trần Thị B' },
  fake: { account: 6, email: 'taikhoan.gia@demo.dpp.vn', fullName: 'Tài khoản giả' },
};

const SERIAL = 'ABC-2026-000128';
/** Ảnh PNG 1×1 làm biên bản sửa chữa mẫu. */
const EVIDENCE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function fail(message) {
  process.stderr.write(`\n${message}\n`);
  process.exit(1);
}

function step(message) {
  process.stdout.write(`• ${message}\n`);
}

if (PASSWORD.length < 10) {
  fail(
    'Đặt DEMO_PASSWORD (ít nhất 10 ký tự) trước khi chạy, ví dụ trong PowerShell: $env:DEMO_PASSWORD="..."',
  );
}
if (!process.env.DATABASE_URL) {
  fail('Thiếu DATABASE_URL trong .env');
}

const provider = new JsonRpcProvider(RPC, undefined, { polling: false });
const { chainId } = await provider
  .getNetwork()
  .catch(() => fail(`Không kết nối được RPC ${RPC}. Bật Hardhat node trước.`));
if (chainId !== LOCAL_CHAIN_ID) {
  fail(
    `RPC_URL đang trỏ tới chain ${chainId}. Script chỉ chạy với Hardhat local (31337) để không tốn MON thật.`,
  );
}

/** Một người dùng web: cookie phiên + ví Hardhat thay MetaMask. */
class Person {
  constructor(key, profile) {
    this.key = key;
    this.profile = profile;
    this.cookie = '';
  }

  async init() {
    this.wallet = await provider.getSigner(this.profile.account);
    this.address = await this.wallet.getAddress();
  }

  async call(method, path, body) {
    const isForm = body instanceof FormData;
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        origin: ORIGIN,
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(body === undefined || isForm ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
    const session = response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('dpp_session='));
    if (session) {
      this.cookie = session.split(';')[0];
    }
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const error = new Error(`${method} ${path} → ${response.status}: ${data?.message ?? text}`);
      error.status = response.status;
      error.code = data?.code;
      throw error;
    }
    return data;
  }

  get(path) {
    return this.call('GET', path);
  }

  post(path, body) {
    return this.call('POST', path, body);
  }
}

async function waitFor(description, check) {
  const started = Date.now();
  for (;;) {
    const value = await check().catch(() => null);
    if (value) return value;
    if (Date.now() - started > WAIT_MS) {
      fail(
        `Quá ${WAIT_MS / 1000} giây vẫn chưa thấy: ${description}. Kiểm tra Worker (pnpm dev) có đang chạy và log có lỗi không.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/** Ví gửi giao dịch như MetaMask, rồi web báo txHash cho API (nếu có đường báo). */
async function send(person, address, abi, method, args, report, value) {
  const contract = new Contract(address, abi, person.wallet);
  const tx = await contract.getFunction(method)(...args, ...(value ? [{ value }] : []));
  const receipt = await tx.wait();
  if (receipt?.status !== 1) fail(`${method} bị revert (${tx.hash})`);
  if (report) {
    await person.post(report.path, { txHash: tx.hash, ...report.extra });
  }
  return tx.hash;
}

const people = Object.fromEntries(
  Object.entries(PEOPLE).map(([key, profile]) => [key, new Person(key, profile)]),
);
for (const person of Object.values(people)) {
  await person.init();
}

// 0. Tài khoản và ví -----------------------------------------------------------
step('Đăng ký 7 tài khoản demo');
for (const person of Object.values(people)) {
  try {
    await person.post('/auth/register', {
      email: person.profile.email,
      password: PASSWORD,
      fullName: person.profile.fullName,
    });
  } catch (error) {
    if (error.code === 'EMAIL_TAKEN') {
      fail(
        `Tài khoản ${person.profile.email} đã có. Script cần CSDL vừa làm sạch: tắt pnpm dev, chạy "pnpm --filter @dpp/api db:reset" rồi deploy lại contract (xem docs/demo-kich-ban.md).`,
      );
    }
    throw error;
  }
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
await db.query("UPDATE users SET system_role = 'ADMIN', updated_at = now() WHERE email = $1", [
  PEOPLE.admin.email,
]);
await db.end();
step(`Cấp quyền Admin cho ${PEOPLE.admin.email}`);

step('Liên kết ví Hardhat #0–#6 (ký EIP-4361, gửi registerUser)');
for (const person of Object.values(people)) {
  const challenge = await person.post('/me/wallet-links/challenge', {
    address: person.address,
    purpose: 'LINK',
  });
  const signature = await person.wallet.signMessage(challenge.message);
  const authorization = await person.post('/me/wallet-links/authorize', {
    challengeToken: challenge.challengeToken,
    signature,
  });
  const txHash = await send(
    person,
    authorization.contractAddress,
    PARTY_REGISTRY_ABI,
    'registerUser',
    [authorization.partyId, BigInt(authorization.deadline), authorization.signature],
  );
  await person.post(`/me/wallet-links/${authorization.walletId}/transaction`, { txHash });
}
for (const person of Object.values(people)) {
  await waitFor(`ví của ${person.profile.email} được kích hoạt`, async () =>
    (await person.get('/auth/me')).wallets.some((wallet) => wallet.status === 'ACTIVE'),
  );
}

// 1. Admin duyệt 3 doanh nghiệp ABC ---------------------------------------------
const ORGANIZATIONS = {
  maker: {
    name: 'Công ty TNHH Sản xuất ABC',
    taxCode: '0319990128',
    orgType: 'MANUFACTURER',
    address: 'Lô B2, KCN Tân Tạo, TP. Hồ Chí Minh',
  },
  shop: {
    name: 'Cửa hàng Điện máy ABC',
    taxCode: '0319990129',
    orgType: 'RETAILER',
    address: '88 Lê Lợi, Quận 1, TP. Hồ Chí Minh',
  },
  center: {
    name: 'Trung tâm Bảo hành ABC',
    taxCode: '0319990130',
    orgType: 'SERVICE_CENTER',
    address: '12 Cách Mạng Tháng 8, Quận 3, TP. Hồ Chí Minh',
  },
};
const organizationIds = {};
step('Bước 1: nộp đơn 3 doanh nghiệp ABC (kèm phí), Admin duyệt bằng ví #0');
for (const [key, profile] of Object.entries(ORGANIZATIONS)) {
  const person = people[key];
  const auth = await person.post('/me/organization/application', {
    ...profile,
    contactEmail: person.profile.email,
    contactPhone: '028 3812 0128',
  });
  organizationIds[key] = auth.organizationId;
  await send(
    person,
    auth.contractAddress,
    PARTY_REGISTRY_ABI,
    'applyOrganization',
    [auth.partyId, auth.role, auth.profileHash, BigInt(auth.deadline), auth.signature],
    { path: '/me/organization/transactions', extra: { kind: 'applyOrganization' } },
    BigInt(auth.feeWei),
  );
  await waitFor(
    `đơn của ${profile.name} chờ duyệt`,
    async () => (await person.get('/me/organization')).organization?.stage === 'PENDING',
  );
  await send(
    people.admin,
    auth.contractAddress,
    PARTY_REGISTRY_ABI,
    'approveOrganization',
    [auth.partyId],
    {
      path: '/admin/transactions',
      extra: { method: 'approveOrganization' },
    },
  );
  await waitFor(
    `${profile.name} được duyệt`,
    async () => (await person.get('/me/organization')).organization?.stage === 'AUTHORIZED',
  );
}

// 2. Nhà sản xuất phát hành laptop ----------------------------------------------
step(`Bước 2: nhà sản xuất phát hành laptop ${SERIAL}`);
const registration = await people.maker.post('/me/products/registrations', {
  items: [
    {
      serialNumber: SERIAL,
      warrantyMonths: 24,
      modelName: 'Laptop ABC Pro 14',
      description: 'Core i7, RAM 16 GB, SSD 512 GB, màn hình 14 inch',
      manufacturedOn: '2026-10-01',
    },
  ],
});
const passportAddress = registration.contractAddress;
const product = registration.products[0];
const chainProductId = registration.productIds[0];
await send(
  people.maker,
  passportAddress,
  PRODUCT_PASSPORT_ABI,
  'registerProducts',
  [
    registration.issuerId,
    registration.productIds,
    registration.metadataHashes,
    registration.warrantyMonths,
    BigInt(registration.deadline),
    registration.signature,
  ],
  { path: '/me/products/transactions' },
);
await waitFor(
  'sản phẩm lên chain',
  async () => (await people.maker.get(`/me/products/${product.id}`)).productState === 'CREATED',
);

// 3. Bàn giao cho cửa hàng -----------------------------------------------------
step('Bước 3: nhà sản xuất gửi hàng, cửa hàng xác nhận nhận (AT_RETAIL)');
await send(
  people.maker,
  passportAddress,
  PRODUCT_PASSPORT_ABI,
  'dispatchCustody',
  [chainProductId, partyIdFromUuid(organizationIds.shop)],
  { path: '/me/products/transactions' },
);
await waitFor(
  'hàng tới kho cửa hàng',
  async () =>
    (await people.shop.get(`/me/inventory/${product.id}`)).productState === 'IN_DISTRIBUTION',
);
await send(
  people.shop,
  passportAddress,
  PRODUCT_PASSPORT_ABI,
  'confirmCustodyReceipt',
  [chainProductId],
  {
    path: '/me/inventory/transactions',
  },
);
await waitFor(
  'cửa hàng nhận hàng',
  async () => (await people.shop.get(`/me/inventory/${product.id}`)).productState === 'AT_RETAIL',
);

// 4. Bán cho người dùng A --------------------------------------------------------
step('Bước 4: cửa hàng bán cho người dùng A, kích hoạt bảo hành');
const sale = await people.shop.post(`/me/inventory/${product.id}/sale-authorizations`, {
  buyerEmail: PEOPLE.userA.email,
});
await send(
  people.shop,
  sale.contractAddress,
  PRODUCT_PASSPORT_ABI,
  'sellAndActivateWarranty',
  [sale.productId, sale.buyerId, BigInt(sale.deadline), sale.signature],
  { path: '/me/inventory/transactions' },
);
await waitFor('người dùng A sở hữu sản phẩm', async () =>
  (await people.userA.get('/me/owned-products')).some((item) => item.id === product.id),
);

// 6. Trung tâm bảo hành thay SSD --------------------------------------------------
step('Bước 6: người dùng A gửi yêu cầu bảo hành, trung tâm mở phiếu "thay SSD" và đóng phiếu');
const service = await people.userA.get(`/me/owned-products/${product.id}/service`);
const center = service.centers.find((option) => option.organizationId === organizationIds.center);
if (!center) fail('Không thấy Trung tâm Bảo hành ABC trong danh sách chọn của người dùng A.');
const request = await people.userA.post(`/me/owned-products/${product.id}/service-requests`, {
  serviceCenterOrgId: center.organizationId,
  issueDesc: 'Máy chạy chậm, Windows báo ổ SSD sắp hỏng',
});
const opening = await people.center.post(
  `/me/service-tickets/${request.id}/opening-authorizations`,
);
await send(
  people.center,
  opening.contractAddress,
  SERVICE_TICKET_MANAGER_ABI,
  'openTicket',
  [
    opening.ticketId,
    opening.productId,
    opening.requesterId,
    BigInt(opening.deadline),
    opening.signature,
  ],
  { path: '/me/service-tickets/transactions' },
);
await waitFor(
  'phiếu sửa được mở',
  async () => (await people.center.get(`/me/service-tickets/${request.id}`)).state === 'IN_REPAIR',
);
const form = new FormData();
form.set('repaired', 'true');
form.set('actionCode', 'REPLACE_PART');
form.set('actionDetail', 'Thay SSD 512 GB mới, sao lưu và chép lại dữ liệu cho khách');
form.set('evidence', new Blob([EVIDENCE_PNG], { type: 'image/png' }), 'bien-ban-thay-ssd.png');
const closing = await people.center.post(`/me/service-tickets/${request.id}/results`, form);
await send(
  people.center,
  closing.contractAddress,
  SERVICE_TICKET_MANAGER_ABI,
  'closeTicket',
  [closing.ticketId, closing.repaired, closing.evidenceHash],
  { path: '/me/service-tickets/transactions' },
);
await waitFor(
  'phiếu sửa được đóng',
  async () => (await people.center.get(`/me/service-tickets/${request.id}`)).state === 'REPAIRED',
);

// Tóm tắt --------------------------------------------------------------------------
const rows = Object.values(people).map(
  (person) =>
    `  #${person.profile.account}  ${person.address}  ${person.profile.email.padEnd(26)} ${person.profile.fullName}`,
);
process.stdout.write(
  [
    '',
    'Đã dựng xong bước 1–6 của kịch bản demo. Mật khẩu mọi tài khoản là DEMO_PASSWORD bạn đã đặt.',
    'Ví Hardhat (nhập khoá riêng của tài khoản Hardhat cùng số thứ tự vào MetaMask):',
    ...rows,
    '',
    `Laptop ${SERIAL}: hộ chiếu công khai ${WEB}/p/${product.publicCode}`,
    'Bước 7–13 làm trực tiếp trên web: xem docs/demo-kich-ban.md.',
    '',
  ].join('\n'),
);
