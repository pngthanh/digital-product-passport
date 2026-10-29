# Hộ chiếu số sản phẩm (Digital Product Passport)

Hệ thống quản lý vòng đời, bảo hành và chuyển quyền sở hữu sản phẩm, ghi nhận các sự kiện quan trọng lên **Monad Testnet** (chain ID `10143`). Token MON chỉ dùng để kiểm thử, không có giá trị thương mại hay pháp lý.

| Module | Nội dung                                       | Trạng thái    |
| ------ | ---------------------------------------------- | ------------- |
| M0     | Thiết kế chuẩn hoá và bảng traceability        | Xong          |
| M1     | Foundation & Core Infrastructure               | Xong          |
| M2     | Identity & Auth: tài khoản, ví MetaMask, Party | Xong          |
| M3     | Indexer quét log, đối soát                     | Xong          |
| **M4** | **Doanh nghiệp và phí MON, khu Quản trị**      | **Xong**      |
| M5     | Sản phẩm, mã QR, tra cứu                       | Kế tiếp       |
| M6–M13 | Bảo hành, chuyển quyền, ...                    | Theo lộ trình |

## M1 gồm những gì

- **Monorepo pnpm** với 4 workspace: `apps/api`, `apps/web`, `packages/contracts`, `packages/shared`.
- **API NestJS 12 chạy 2 tiến trình** từ cùng một codebase: `main.ts` (HTTP) và `worker.ts` (Indexer, Scheduler). Đã có cấu hình kiểm tra bằng zod, logger, định dạng lỗi chung, mã yêu cầu, kết nối PostgreSQL qua Prisma 7, kết nối RPC có dự phòng, kiểm tra chain ID khi khởi động, endpoint `/health` và `/health/ready`.
- **CSDL 22 bảng** (M3 bỏ `custodial_keys`, còn 21) theo thiết kế chuẩn hoá: Prisma schema, migration đầu tiên kèm 69 CHECK constraint, 4 partial unique index (`ux_transfer_one_active`, `ux_service_one_open`, ...) và trigger chỉ-INSERT cho `audit_logs`.
- **Hardhat 3 + OpenZeppelin 5** cấu hình sẵn Monad Testnet (deploy, verify qua Sourcify của MonadVision hoặc Monadscan) cùng kiểu dữ liệu, role, lỗi dùng chung cho 4 contract sẽ viết ở các module sau.
- **Next.js 16 (App Router) + Tailwind 4**: bộ giao diện dùng chung, trang tổng quan, trang trạng thái hệ thống đọc dữ liệu thật từ API.
- **102 test tự động** (lúc giao M1), trong đó 28 test e2e chạy trên PostgreSQL thật để chứng minh từng ràng buộc CSDL hoạt động đúng.

## M2 gồm những gì

Mô hình Hybrid: tài khoản là Web2 (email, mật khẩu), ví MetaMask của chính người dùng ký và trả gas mọi giao dịch on-chain. Chi tiết luồng, API và bảng traceability: [docs/m2-identity-auth.md](docs/m2-identity-auth.md).

- **ACC-01 Đăng ký**: tạo `users` + `parties` (USER), mật khẩu băm Argon2id (salt ngẫu nhiên, tham số OWASP). Chưa đụng blockchain.
- **ACC-02 Đăng nhập, đăng xuất**: JWT trong cookie httpOnly. Đăng xuất tăng `users.session_version` nên mọi phiên cũ hết hiệu lực ngay. Có giới hạn số lần thử và chặn CSRF theo Origin.
- **ACC-03 Liên kết MetaMask**: ví ký thông điệp EIP-4361, backend cấp giấy phép EIP-712, rồi chính ví đó gọi `PartyRegistry.registerUser` và tự trả gas.
- **ACC-04 Xoay ví cá nhân**: nhập lại mật khẩu, ví mới ký EIP-4361 và tự gọi `rotateWallet`. Ví cũ thành ROTATED; mỗi địa chỉ ví chỉ dùng một lần.
- **Contract `PartyRegistry`** (phần người dùng) và **Worker chốt giao dịch**: chờ block finalized, ghi `blockchain_events`, chiếu event sang `parties`/`party_wallets`.
- **232 test tự động** (188 unit và contract, 44 e2e) lúc giao M2. Test e2e liên kết ví tự chạy một Hardhat node, deploy PartyRegistry rồi đi trọn luồng UC → API → contract → event → CSDL.

## M3 gồm những gì

Chi tiết quyết định, luồng và cấu hình: [docs/m3-indexer.md](docs/m3-indexer.md).

- **Indexer** trong Worker: quét log PartyRegistry từ block deploy, ghi `blockchain_events` PENDING rồi FINALIZED (hoặc ORPHANED nếu block bị thay), lưu mốc ở `indexer_checkpoints`, chiếu event sang module sở hữu. Event vẫn được chiếu khi web không kịp báo `txHash`.
- **Chiếu đúng một lần**: Indexer và luồng chốt giao dịch của M2 dùng chung một hàm chốt event trong cùng giao dịch CSDL với projector.
- **Đối soát** định kỳ ví trong CSDL với `PartyRegistry.walletOf`; lệch thì tạo `anomaly_alerts` mức HIGH, không tạo trùng.
- `/health/ready` và trang Trạng thái hệ thống có thêm mục **Indexer** (đã chốt tới block nào, chậm bao nhiêu block).
- **CSDL còn 21 bảng** (bỏ `custodial_keys`). Giao diện bỏ trang Bộ giao diện, footer và hai mục giới thiệu; lịch sử hồ sơ mẫu chia tab Phân phối, Bảo hành, Chuyển nhượng.
- **250 test tự động** (200 unit và contract, 50 e2e) lúc giao M3. Test e2e của Indexer chạy trên Hardhat node: giao dịch web không báo vẫn được chiếu, báo sau không chiếu lần hai, sửa tay CSDL thì đối soát phát hiện.

## M4 gồm những gì

Doanh nghiệp không có ví riêng: người đại diện dùng chính ví MetaMask cá nhân đã liên kết để ký, trả phí và nhận tiền hoàn. Chi tiết quyết định D25–D30, luồng và gas: [docs/m4-organizations.md](docs/m4-organizations.md).

- **ORG-01 Nộp đơn doanh nghiệp** ở trang **Doanh nghiệp** (`/organization`): nhập tay tên, mã số thuế, loại (nhà sản xuất, nhà bán lẻ, trung tâm bảo hành, đơn vị kiểm định), liên hệ. Ví cá nhân gọi `applyOrganization` kèm 8 MON; contract **giữ phí** tới khi Admin quyết định. Mỗi tài khoản đại diện đúng một doanh nghiệp.
- **ORG-02, ORG-03 Duyệt hoặc từ chối** ở khu **Quản trị** (`/admin`): duyệt thì phí về ví Treasury; từ chối kèm lý do thì người đại diện tự rút lại 8 MON, sửa hồ sơ và nộp lại.
- **ORG-04 Khoá doanh nghiệp**, **ORG-06 đổi phí và ví Treasury**. ORG-05 (ví vận hành) bỏ theo D25.
- **PartyRegistry** thêm phần doanh nghiệp: giấy phép EIP-712 `OrganizationApplication`, phí giữ trong contract, hoàn tiền kiểu pull (`withdrawRefund`, `nonReentrant`), hàm `authorizedOrganizationOf` để contract sản phẩm ở M5 kiểm tra quyền.
- Indexer chiếu event doanh nghiệp sang `organizations`, `fee_payments`, `fee_policies`. Lệnh `admin:grant` cấp quyền Admin cho một tài khoản.
- **302 test tự động** (243 unit và contract, 59 e2e). Test e2e doanh nghiệp chạy trọn luồng trên Hardhat node: nộp đơn, từ chối, rút phí, nộp lại, duyệt (Treasury nhận đúng 8 MON), khoá, đổi phí.

---

## 1. Chuẩn bị

| Công cụ        | Phiên bản                | Ghi chú                                              |
| -------------- | ------------------------ | ---------------------------------------------------- |
| Node.js        | 22 LTS (tối thiểu 22.13) | Hardhat 3 yêu cầu ≥ 22.13                            |
| pnpm           | 10.x                     | Bật bằng `corepack enable`, không cần cài riêng      |
| Docker Desktop | bản mới                  | Chạy PostgreSQL 17                                   |
| Git            | bản mới                  |                                                      |
| MetaMask       | bản mới                  | Cần từ M2; lấy MON test tại https://faucet.monad.xyz |

Kiểm tra nhanh:

```bash
node -v        # v22.x
corepack enable
pnpm -v        # 10.x
docker -v
```

## 2. Cài đặt từ A đến Z

```bash
# 1. Lấy mã nguồn
git clone <url-repo-cua-nhom> dpp
cd dpp

# 2. Cài thư viện. Bước postinstall tự build @dpp/shared và sinh Prisma Client.
pnpm install

# 3. Tạo file cấu hình (Windows PowerShell: Copy-Item .env.example .env)
cp .env.example .env

# 3b. (M2) Sinh bí mật rồi chép 2 dòng in ra vào .env
pnpm --filter @dpp/api secret:new       # JWT_SECRET=...
pnpm --filter @dpp/api registrar:new    # REGISTRAR_SIGNER_PRIVATE_KEY=...

# 4. Bật PostgreSQL 17 trong Docker (tự tạo 2 CSDL: dpp và dpp_test)
pnpm db:up

# 5. Áp migration vào CSDL phát triển và CSDL test
pnpm db:deploy
pnpm --filter @dpp/api db:deploy:test

# 6. Biên dịch và test Smart Contract
pnpm contracts:compile
pnpm contracts:test

# 7. (M2) Deploy PartyRegistry lên Monad Testnet (ví deploy cần MON),
#    chép PARTY_REGISTRY_ADDRESS và PARTY_REGISTRY_DEPLOY_BLOCK in ra vào .env
pnpm --filter @dpp/contracts deploy:monad

# 8. Chạy toàn bộ: API (cổng 4000), Worker và Web (cổng 3000)
pnpm dev

# 9. (M4) Đăng ký tài khoản Admin trên web, rồi cấp quyền (cửa sổ khác)
pnpm --filter @dpp/api admin:grant <email-admin>
```

Mở trình duyệt:

- http://localhost:3000 — trang tổng quan.
- http://localhost:3000/register — tạo tài khoản, sau đó vào **Tài khoản** để liên kết MetaMask.
- http://localhost:3000/organization — nộp đơn doanh nghiệp, theo dõi duyệt, rút phí khi bị từ chối (cần ví đã liên kết).
- http://localhost:3000/admin — khu Quản trị: duyệt, từ chối, khoá doanh nghiệp, đổi phí. Chỉ tài khoản Admin mới thấy (người khác nhận 404). Tài khoản Admin phải liên kết **đúng ví đã deploy** PartyRegistry.
- http://localhost:3000/system/status — trạng thái CSDL, blockchain và Indexer (mở từ khu Quản trị).
- http://localhost:4000/api/v1/health/ready — báo cáo JSON (trả 503 khi chưa sẵn sàng).

### Chạy với blockchain cục bộ (không cần Internet)

```bash
# Cửa sổ 1: mạng Hardhat cục bộ, chain ID 31337
pnpm --filter @dpp/contracts node
```

Sửa `.env`: `CHAIN_ID=31337`, `RPC_URL=http://127.0.0.1:8545`, `RPC_FALLBACK_URL=` (để trống). Ở cửa sổ 2 chạy `pnpm --filter @dpp/contracts deploy:local`, chép `PARTY_REGISTRY_ADDRESS` và `PARTY_REGISTRY_DEPLOY_BLOCK` vào `.env`, rồi `pnpm dev`.

Để thử liên kết ví với mạng cục bộ: trong MetaMask thêm mạng RPC `http://127.0.0.1:8545`, chain ID `31337`, ký hiệu `ETH`; import một tài khoản thử từ danh sách Hardhat node in ra (khoá công khai, **chỉ dùng cục bộ**). Mỗi lần khởi động lại Hardhat node, contract phải deploy lại, CSDL cần làm mới bằng `pnpm --filter @dpp/api db:reset` (mốc quét của Indexer thuộc chain cũ), và MetaMask cần xoá lịch sử giao dịch của tài khoản (Settings → Advanced → Clear activity tab data) để không lệch nonce.

## 3. Cấu trúc thư mục

```text
dpp/
├── apps/
│   ├── api/                         # NestJS – Modular Monolith
│   │   ├── prisma/
│   │   │   ├── schema.prisma        # 21 bảng, enum, partial unique index
│   │   │   └── migrations/          # SQL migration (kèm CHECK, trigger)
│   │   ├── src/
│   │   │   ├── main.ts              # tiến trình HTTP API
│   │   │   ├── worker.ts            # tiến trình Worker (Indexer, đối soát, Scheduler)
│   │   │   ├── app.module.ts        # module gốc của API
│   │   │   ├── worker.module.ts     # module gốc của Worker
│   │   │   ├── config/              # nạp .env, kiểm tra bằng zod, AppConfigService
│   │   │   ├── common/              # filter lỗi, pipe zod, mã yêu cầu, logger
│   │   │   ├── infrastructure/
│   │   │   │   ├── database/        # PrismaService (Prisma 7 + driver adapter pg)
│   │   │   │   └── blockchain/      # JSON-RPC có dự phòng, kiểm tra chain ID
│   │   │   └── modules/
│   │   │       ├── health/          # module mẫu theo 4 tầng
│   │   │       │   ├── presentation/    # controller, scheduler
│   │   │       │   ├── application/     # use case, port
│   │   │       │   ├── domain/          # quy tắc nghiệp vụ thuần
│   │   │       │   ├── infrastructure/  # hiện thực port (DB, RPC)
│   │   │       │   └── index.ts         # public API duy nhất của module
│   │   │       ├── identity/        # M2: ACC-01..04, liên kết ví, projector PartyRegistry; M3: đối soát ví
│   │   │       ├── chain-sync/      # M2: chốt giao dịch ví gửi; M3: Indexer, indexer_checkpoints
│   │   │       ├── organizations/   # M4: ORG-01..06, phí, khu Quản trị, projector doanh nghiệp
│   │   │       └── audit/           # ghi audit_logs, anomaly_alerts (màn hình xem ở M12)
│   │   ├── scripts/                 # sinh JWT_SECRET, khoá registrar, cấp quyền Admin
│   │   └── test/                    # e2e: health, ràng buộc CSDL, đăng nhập, liên kết ví, Indexer, doanh nghiệp
│   └── web/                         # Next.js 16 + Tailwind 4
│       └── src/
│           ├── app/                 # route: /, /login, /register, /account, /organization, /admin, /system/status
│           ├── components/          # ui/ (button, badge, field, tabs, step-list, ...), layout/
│           ├── features/            # theo tính năng: auth, wallet-link, organization, admin, ...
│           └── lib/                 # env, format, nhãn trạng thái; wallet/ (MetaMask, gửi giao dịch)
├── packages/
│   ├── contracts/                   # Hardhat 3 + OpenZeppelin 5
│   │   ├── contracts/shared/        # DppTypes.sol, DppRoles.sol, DppErrors.sol
│   │   ├── contracts/registry/      # M2: PartyRegistry.sol
│   │   ├── contracts/test/          # contract chỉ dùng trong test
│   │   ├── ignition/modules/        # module deploy (Hardhat Ignition)
│   │   ├── scripts/                 # deploy-identity.ts, export-abi.ts
│   │   ├── test/                    # mocha + ethers
│   │   └── hardhat.config.ts        # mạng monadTestnet, verify
│   └── shared/                      # dùng chung cho API, Web, test contract
│       └── src/
│           ├── abi/                 # ABI sinh từ artifact (không sửa tay)
│           ├── chain/               # thông số mạng, EIP-712 của PartyRegistry
│           ├── domain/              # enum, 4 state machine, role, enum on-chain
│           ├── api/                 # hợp đồng dữ liệu API ↔ Web
│           └── utils/               # chuẩn hoá địa chỉ, hash, MON
├── docker/postgres/init/            # tạo CSDL dpp_test lần đầu
├── docker-compose.yml
├── .env.example
└── .github/workflows/ci.yml         # lint, typecheck, test, e2e, build
```

### Quy tắc phân tầng (bắt buộc)

1. Phụ thuộc chỉ đi một chiều: `presentation → application → domain`. Tầng `infrastructure` hiện thực các port do `application` khai báo.
2. Module khác chỉ import qua `index.ts` của module. Cấm đọc ghi bảng hoặc repository của module khác.
3. Mỗi module sở hữu bảng của mình và projector cho event thuộc nó (ví dụ `identity` chiếu `PartyRegistered`, `WalletRotated`).
4. `packages/shared` không phụ thuộc NestJS, Next.js hay Prisma.

## 4. Quy chuẩn lập trình

| Hạng mục         | Quy ước                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------- |
| Tên file TS/TSX  | `kebab-case`, ví dụ `product-passport.service.ts` (oxlint kiểm tra)                         |
| Biến, hàm        | `camelCase`                                                                                 |
| Class, interface | `PascalCase`                                                                                |
| Hằng số          | `UPPER_SNAKE_CASE`, ví dụ `MONAD_TESTNET`, `MANUFACTURER_ROLE`                              |
| Enum             | Object hằng `PascalCase` kèm kiểu cùng tên (`ProductState`), không dùng `enum` của TS       |
| File Solidity    | `PascalCase.sol` theo Solidity Style Guide (trùng tên contract)                             |
| Comment          | JSDoc ngắn trên hàm chính; comment inline chỉ cho logic phức tạp                            |
| Giao diện        | Tối giản, xanh đại dương đậm + xám lạnh, không gradient, dùng token màu trong `globals.css` |

Lưu ý NestJS: `apps/api` tắt rule `consistent-type-imports` vì NestJS cần import giá trị (không phải `import type`) cho class được inject qua constructor.

## 5. Cơ sở dữ liệu

### Ba loại dữ liệu

| Ký hiệu | Ý nghĩa                 | Ai được ghi          | Ví dụ                                            |
| ------- | ----------------------- | -------------------- | ------------------------------------------------ |
| [A]     | Off-chain authoritative | API                  | users, audit_logs, chain_transactions            |
| [P]     | On-chain projection     | Chỉ Worker (Indexer) | transfer_requests, warranties, ownership_records |
| [A+P]   | Có cả hai nhóm cột      | Theo từng cột        | products, organizations, service_requests        |
| [R]     | Raw event cache         | Chỉ Worker (Indexer) | blockchain_events, indexer_checkpoints           |

Mỗi model trong `schema.prisma` ghi rõ loại và các cột [P].

### Ràng buộc chính đã kiểm chứng bằng test e2e

| Ràng buộc                          | Ý nghĩa                                                    |
| ---------------------------------- | ---------------------------------------------------------- |
| `ck_parties_subject`               | Party trỏ tới đúng một User hoặc một Organization          |
| `ck_products_owner_matches_state`  | Chưa bán thì chưa có owner; đã bán thì bắt buộc có owner   |
| `ck_products_pending_custodian`    | Chỉ khi đang vận chuyển mới có bên nhận custody đang chờ   |
| `ux_transfer_one_active`           | Mỗi sản phẩm tối đa 1 yêu cầu chuyển quyền REQUESTED       |
| `ux_service_one_open`              | Mỗi sản phẩm tối đa 1 phiếu dịch vụ đang mở                |
| `ux_wallet_one_active_owner`       | Mỗi tổ chức chỉ 1 ví OWNER đang hoạt động                  |
| `ux_wallet_one_active_personal`    | Mỗi người dùng chỉ 1 ví cá nhân đang dùng                  |
| `ux_wallet_one_pending_personal`   | (M2) Mỗi người dùng chỉ 1 yêu cầu liên kết ví đang chờ     |
| `organizations_representative_*`   | (M4) Mỗi tài khoản đại diện tối đa 1 doanh nghiệp          |
| `ck_organizations_status_reason_*` | (M4) Lý do từ chối/khoá nếu có thì không rỗng              |
| `ck_users_session_version_*`       | (M2) Phiên bản phiên đăng nhập không âm                    |
| `warranties_product_id_key`        | Mỗi sản phẩm 1 bảo hành hiện hành                          |
| `ux_blockchain_events_identity`    | Event ghi idempotent theo (chain_id, tx_hash, log_index)   |
| `ck_blockchain_events_finality`    | FINALIZED phải có thời điểm, không bao giờ thành ORPHANED  |
| `ck_users_password_hash_argon2id`  | Mật khẩu lưu dạng băm Argon2id                             |
| `trg_audit_logs_append_only`       | `audit_logs` không cho UPDATE/DELETE                       |
| Địa chỉ, hash                      | Lưu chữ thường, đúng 42/66 ký tự hex                       |
| Khoá ngoại                         | `ON DELETE RESTRICT`, không xoá dây chuyền dữ liệu lịch sử |

### Thêm migration mới

Migration của M2: `20261028000000_identity_auth` (thêm `users.session_version` và `ux_wallet_one_pending_personal`). Migration của M3: `20261028120000_drop_custodial_keys` (bỏ bảng `custodial_keys`). Migration của M4: `20261029000000_organization_representative` (thêm `organizations.representative_user_id` và `status_reason`). Máy đã chạy module trước chỉ cần `pnpm db:deploy` và `pnpm --filter @dpp/api db:deploy:test`; riêng M4 phải deploy lại PartyRegistry nên làm mới CSDL bằng `db:reset` (xem [docs/m4-organizations.md](docs/m4-organizations.md) mục 5).

```bash
# 1. Sửa apps/api/prisma/schema.prisma
# 2. Sinh migration nhưng chưa áp dụng
pnpm --filter @dpp/api exec prisma migrate dev --create-only --name ten_thay_doi
# 3. Thêm CHECK/trigger (nếu có) vào cuối file migration.sql vừa sinh
# 4. Áp dụng
pnpm db:migrate
```

- CHECK constraint và trigger viết tay trong migration vì Prisma schema không mô tả được. Prisma Migrate không xoá chúng ở các lần sau.
- Partial unique index khai báo ngay trong schema (preview feature `partialIndexes`). Với điều kiện viết bằng `raw(...)`, hãy viết đúng dạng PostgreSQL chuẩn hoá (ví dụ `service_state = ANY (ARRAY[...])`), nếu không Prisma sẽ tưởng có thay đổi và sinh migration thừa.

## 6. Smart Contract trên Monad Testnet

- Mạng `monadTestnet` trong `hardhat.config.ts`: chain ID 10143, RPC mặc định `https://testnet-rpc.monad.xyz` (đổi bằng `MONAD_TESTNET_RPC_URL`).
- Khoá ví deploy nên lưu bằng keystore của Hardhat thay vì để trong `.env`:

  ```bash
  pnpm --filter @dpp/contracts exec hardhat keystore set DEPLOYER_PRIVATE_KEY
  ```

- Deploy PartyRegistry: `pnpm --filter @dpp/contracts deploy:monad` (hoặc `deploy:local` cho Hardhat node). Script cấp `REGISTRAR_ROLE` cho địa chỉ của `REGISTRAR_SIGNER_PRIVATE_KEY` và in các dòng cần chép vào `.env`. Khoá registrar chỉ ký giấy phép, không cần MON.
- Sau khi sửa contract: `pnpm --filter @dpp/contracts abi:export` để cập nhật ABI trong `@dpp/shared` (test báo đỏ nếu quên).
- Xác minh mã nguồn: `pnpm --filter @dpp/contracts exec hardhat verify <địa_chỉ> --network monadTestnet`. Sourcify của MonadVision không cần API key; Monadscan cần `ETHERSCAN_API_KEY`.
- Nếu mạng chặn tải trình biên dịch Solidity, đặt `SOLC_PATH` tới `soljson.js` (gói npm `solc`) hoặc file solc native.

Ba điểm khác Ethereum cần nhớ khi code các module sau:

1. Phí gas tính theo **gas limit**, không phải gas đã dùng, nên Backend phải đặt gas limit sát ước lượng.
2. Block finalized sau 2 block và không thể reorg; Indexer chỉ chiếu event sang bảng [P] khi block đã finalized. RPC công khai giới hạn `eth_getLogs` 100 block mỗi lần.
3. Ví có số dư dưới 10 MON (reserve balance) có thể bị revert giao dịch chuyển MON; nạp cho ví cá nhân của người đại diện từ 20 MON trở lên trước khi demo nộp phí 8 MON.

## 7. Lệnh thường dùng

| Lệnh                                         | Việc làm                                                           |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm dev`                                   | Chạy API, Worker, Web cùng lúc ở chế độ theo dõi thay đổi          |
| `pnpm build`                                 | Build toàn bộ theo đúng thứ tự phụ thuộc                           |
| `pnpm lint` / `pnpm typecheck`               | Kiểm tra lint (oxlint, ESLint) và kiểu                             |
| `pnpm test`                                  | Unit test (shared, api, web) và test contract                      |
| `pnpm test:e2e`                              | Test e2e trên CSDL `dpp_test`                                      |
| `pnpm format` / `pnpm format:check`          | Định dạng mã bằng Prettier                                         |
| `pnpm db:up` / `pnpm db:down`                | Bật / tắt PostgreSQL trong Docker                                  |
| `pnpm db:migrate` / `pnpm db:deploy`         | Tạo migration khi phát triển / áp migration có sẵn                 |
| `pnpm db:studio`                             | Mở Prisma Studio xem dữ liệu                                       |
| `pnpm contracts:compile` / `contracts:test`  | Biên dịch / test Smart Contract                                    |
| `pnpm --filter @dpp/contracts deploy:local`  | Deploy PartyRegistry lên Hardhat node (`deploy:monad` cho testnet) |
| `pnpm --filter @dpp/contracts abi:export`    | Sinh lại ABI vào `packages/shared/src/abi`                         |
| `pnpm --filter @dpp/api secret:new`          | Sinh `JWT_SECRET`                                                  |
| `pnpm --filter @dpp/api registrar:new`       | Sinh khoá ký giấy phép `REGISTRAR_SIGNER_PRIVATE_KEY`              |
| `pnpm --filter @dpp/api admin:grant <email>` | Cấp quyền Admin cho tài khoản (`admin:revoke` để thu hồi)          |

## 8. Test chứng minh traceability

| Test                                                                    | Chứng minh                                                                            |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `apps/api/src/infrastructure/database/prisma-enums.spec.ts`             | Enum PostgreSQL trùng tên và thứ tự với `@dpp/shared`                                 |
| `packages/contracts/test/shared/dpp-types.test.ts`                      | Enum và role trong Solidity trùng với `@dpp/shared`                                   |
| `apps/api/test/database/schema-constraints.e2e-spec.ts`                 | Từng ràng buộc CSDL chặn đúng dữ liệu sai                                             |
| `packages/contracts/test/registry/party-registry.test.ts`               | ACC-03/04 on-chain: mỗi điều kiện revert có một ca                                    |
| `packages/contracts/test/shared/abi-export.test.ts`                     | ABI dùng ở API/Web trùng contract đã biên dịch                                        |
| `apps/api/test/identity/auth.e2e-spec.ts`                               | ACC-01/02: Argon2id, cookie, session_version, CSRF                                    |
| `apps/api/test/identity/wallet-link.e2e-spec.ts`                        | ACC-03/04 thật trên Hardhat node: UC → DB → contract → event                          |
| `apps/api/test/chain-sync/indexer.e2e-spec.ts`                          | (M3) Indexer chiếu event một lần, đối soát tạo cảnh báo                               |
| `packages/contracts/test/registry/party-registry-organizations.test.ts` | (M4) Giữ phí, duyệt chuyển Treasury, từ chối và rút phí, nộp lại, đổi ví, khoá        |
| `apps/api/test/organizations/organizations.e2e-spec.ts`                 | (M4) ORG-01..06 thật trên Hardhat node: nộp đơn → từ chối → rút phí → nộp lại → duyệt |

Chuỗi `Database ↔ shared ↔ Solidity ↔ Web` được kiểm tra tự động mỗi lần chạy CI, nên một bên đổi mà quên bên kia thì test sẽ đỏ.

## 9. Xử lý sự cố

| Hiện tượng                                                | Cách xử lý                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cổng 5433 đã bị chiếm                                     | Đổi `POSTGRES_PORT` và cổng trong `DATABASE_URL`, `TEST_DATABASE_URL`                                                                                                                                                                                                                                                                    |
| `P1000` khi `pnpm db:deploy`                              | Xem tên user trong lỗi: khác `POSTGRES_USER` nghĩa là Prisma không đọc chuỗi kết nối từ `.env` (biến môi trường Windows `DATABASE_URL` được ưu tiên hơn `.env`) hoặc `.env` ghi sai; user đúng mà vẫn lỗi thì cổng trong `DATABASE_URL` đang trỏ vào PostgreSQL cài sẵn trên máy (`Get-Service *postgres*`), không phải container Docker |
| Đổi `POSTGRES_*` sau khi đã `db:up`                       | Container chỉ tạo user lúc khởi tạo volume; chạy `docker compose down -v` rồi `pnpm db:up`                                                                                                                                                                                                                                               |
| Thiếu CSDL `dpp_test`                                     | Script tạo CSDL chỉ chạy lần đầu; chạy `docker compose down -v` rồi `pnpm db:up`                                                                                                                                                                                                                                                         |
| API dừng với `ChainMismatchError`                         | `RPC_URL` trỏ sai mạng so với `CHAIN_ID`; sửa cho khớp                                                                                                                                                                                                                                                                                   |
| API báo `Cấu hình môi trường không hợp lệ`                | Thông báo liệt kê đúng biến sai; đối chiếu với `.env.example`                                                                                                                                                                                                                                                                            |
| Trang trạng thái báo không kết nối được API               | Chạy `pnpm dev`, kiểm tra `API_INTERNAL_URL`                                                                                                                                                                                                                                                                                             |
| `prisma generate` lỗi tải engine                          | Máy cần truy cập `binaries.prisma.sh` ở lần cài đầu; thử lại khi có mạng                                                                                                                                                                                                                                                                 |
| API báo thiếu `JWT_SECRET`                                | Chạy `pnpm --filter @dpp/api secret:new`, chép dòng in ra vào `.env`                                                                                                                                                                                                                                                                     |
| Trang Tài khoản báo chưa cấu hình PartyRegistry           | Thiếu `REGISTRAR_SIGNER_PRIVATE_KEY` hoặc `PARTY_REGISTRY_ADDRESS`; xem bước 3b và 7 ở mục 2                                                                                                                                                                                                                                             |
| MetaMask báo lỗi nonce sau khi khởi động lại Hardhat node | MetaMask → Settings → Advanced → Clear activity tab data, rồi deploy lại contract                                                                                                                                                                                                                                                        |
| Header hiện sai tên mạng                                  | Web đọc `CHAIN_ID` trong `.env`; sửa rồi khởi động lại `pnpm dev`                                                                                                                                                                                                                                                                        |
| Trạng thái hệ thống báo Indexer chưa quét hoặc chậm       | Worker chưa chạy (`pnpm dev` chạy cả Worker) hoặc đang bắt kịp từ block deploy; xem log Worker. Chậm lâu thì kiểm tra `PARTY_REGISTRY_DEPLOY_BLOCK` và RPC                                                                                                                                                                               |
| Worker báo block finalized thấp hơn mốc đã quét           | Thường do vừa khởi động lại Hardhat node: chạy `pnpm --filter @dpp/api db:reset` rồi deploy lại contract                                                                                                                                                                                                                                 |
| Khu Quản trị báo ví Admin chưa có quyền trên contract     | Tài khoản Admin đang liên kết ví khác ví đã deploy PartyRegistry. Xoay ví (Tài khoản → Đổi ví) sang đúng ví deploy                                                                                                                                                                                                                       |
| Mở `/admin` ra trang 404                                  | Tài khoản chưa có quyền Admin: chạy `pnpm --filter @dpp/api admin:grant <email>` rồi tải lại trang                                                                                                                                                                                                                                       |
| Nộp đơn báo "Phí đăng ký vừa được thay đổi"               | Admin vừa đổi phí sau khi bạn mở trang; tải lại trang Doanh nghiệp rồi nộp lại                                                                                                                                                                                                                                                           |
| Test e2e báo "Chưa biên dịch contract"                    | Chạy `pnpm contracts:compile` (hoặc `pnpm test`) trước `pnpm test:e2e`                                                                                                                                                                                                                                                                   |
| Windows: lệnh `cp` không có                               | Dùng `Copy-Item .env.example .env` (PowerShell) hoặc `copy .env.example .env` (cmd)                                                                                                                                                                                                                                                      |

## 10. Đưa lên GitHub

Tạo repo trống trên GitHub (không tick thêm README, .gitignore hay license), rồi chạy ở thư mục gốc:

```bash
git init -b main
git check-ignore -v .env   # phải in ra dòng .gitignore chứa .env
git add .
git commit -m "feat(m1): foundation monorepo, 22-table schema, health API, Hardhat Monad config"
git remote add origin <url-repo-cua-nhom>
git push -u origin main
```

`.gitignore` đã loại `node_modules`, kết quả build, Prisma Client sinh ra và file `.env`. `.gitattributes` giữ xuống dòng kiểu LF trên mọi máy để `pnpm format:check` không báo lỗi trên Windows. CI trên GitHub Actions chạy đủ lint, typecheck, test, test e2e trên PostgreSQL và build ở mỗi lần push.
