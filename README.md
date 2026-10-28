# Hộ chiếu số sản phẩm (Digital Product Passport)

Hệ thống quản lý vòng đời, bảo hành và chuyển quyền sở hữu sản phẩm, ghi nhận các sự kiện quan trọng lên **Monad Testnet** (chain ID `10143`). Token MON chỉ dùng để kiểm thử, không có giá trị thương mại hay pháp lý.

| Module | Nội dung                                           | Trạng thái    |
| ------ | -------------------------------------------------- | ------------- |
| M0     | Thiết kế chuẩn hoá và bảng traceability            | Xong          |
| M1     | Foundation & Core Infrastructure                   | Xong          |
| **M2** | **Identity & Auth**: tài khoản, ví MetaMask, Party | **Xong**      |
| M3     | Indexer quét log, đối soát                         | Kế tiếp       |
| M4–M13 | Tổ chức và phí MON, sản phẩm, bảo hành, ...        | Theo lộ trình |

## M1 gồm những gì

- **Monorepo pnpm** với 4 workspace: `apps/api`, `apps/web`, `packages/contracts`, `packages/shared`.
- **API NestJS 12 chạy 2 tiến trình** từ cùng một codebase: `main.ts` (HTTP) và `worker.ts` (Indexer, Scheduler). Đã có cấu hình kiểm tra bằng zod, logger, định dạng lỗi chung, mã yêu cầu, kết nối PostgreSQL qua Prisma 7, kết nối RPC có dự phòng, kiểm tra chain ID khi khởi động, endpoint `/health` và `/health/ready`.
- **CSDL 22 bảng** theo thiết kế chuẩn hoá: Prisma schema, migration đầu tiên kèm 69 CHECK constraint, 4 partial unique index (`ux_transfer_one_active`, `ux_service_one_open`, ...) và trigger chỉ-INSERT cho `audit_logs`.
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
- **232 test tự động** (188 unit và contract, 44 e2e). Test e2e liên kết ví tự chạy một Hardhat node, deploy PartyRegistry rồi đi trọn luồng UC → API → contract → event → CSDL.

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

# 7. (M2) Deploy PartyRegistry lên Monad Testnet (ví deploy cần MON), chép địa chỉ in ra vào .env
pnpm --filter @dpp/contracts deploy:monad

# 8. Chạy toàn bộ: API (cổng 4000), Worker và Web (cổng 3000)
pnpm dev
```

Mở trình duyệt:

- http://localhost:3000 — trang tổng quan.
- http://localhost:3000/register — tạo tài khoản, sau đó vào **Tài khoản** để liên kết MetaMask.
- http://localhost:3000/system/status — trạng thái CSDL và blockchain, dữ liệu thật từ API.
- http://localhost:4000/api/v1/health/ready — báo cáo JSON (trả 503 khi chưa sẵn sàng).

### Chạy với blockchain cục bộ (không cần Internet)

```bash
# Cửa sổ 1: mạng Hardhat cục bộ, chain ID 31337
pnpm --filter @dpp/contracts node
```

Sửa `.env`: `CHAIN_ID=31337`, `RPC_URL=http://127.0.0.1:8545`, `RPC_FALLBACK_URL=` (để trống), `NEXT_PUBLIC_CHAIN_ID=31337`. Ở cửa sổ 2 chạy `pnpm --filter @dpp/contracts deploy:local`, chép `PARTY_REGISTRY_ADDRESS` vào `.env`, rồi `pnpm dev`.

Để thử liên kết ví với mạng cục bộ: trong MetaMask thêm mạng RPC `http://127.0.0.1:8545`, chain ID `31337`, ký hiệu `ETH`; import một tài khoản thử từ danh sách Hardhat node in ra (khoá công khai, **chỉ dùng cục bộ**). Mỗi lần khởi động lại Hardhat node, contract phải deploy lại và MetaMask cần xoá lịch sử giao dịch của tài khoản (Settings → Advanced → Clear activity tab data) để không lệch nonce.

## 3. Cấu trúc thư mục

```text
dpp/
├── apps/
│   ├── api/                         # NestJS – Modular Monolith
│   │   ├── prisma/
│   │   │   ├── schema.prisma        # 22 bảng, enum, partial unique index
│   │   │   └── migrations/          # SQL migration (kèm CHECK, trigger)
│   │   ├── src/
│   │   │   ├── main.ts              # tiến trình HTTP API
│   │   │   ├── worker.ts            # tiến trình Worker (Indexer M3, Scheduler M9)
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
│   │   │       ├── identity/        # M2: ACC-01..04, phiên JWT, liên kết ví, projector PartyRegistry
│   │   │       ├── chain-sync/      # M2: theo dõi giao dịch ví gửi, chốt khi finalized, ghi event
│   │   │       └── audit/           # M2: ghi audit_logs (màn hình xem ở M12)
│   │   ├── scripts/                 # sinh JWT_SECRET, khoá registrar
│   │   └── test/                    # e2e: health, ràng buộc CSDL, đăng nhập, liên kết ví
│   └── web/                         # Next.js 16 + Tailwind 4
│       └── src/
│           ├── app/                 # route: /, /login, /register, /account, /system/status, /ui-kit
│           ├── components/          # ui/ (button, badge, field, ...), layout/
│           ├── features/            # theo tính năng: auth, wallet-link, system-status, ...
│           └── lib/                 # env, format, nhãn trạng thái tiếng Việt
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

| Ràng buộc                         | Ý nghĩa                                                    |
| --------------------------------- | ---------------------------------------------------------- |
| `ck_parties_subject`              | Party trỏ tới đúng một User hoặc một Organization          |
| `ck_products_owner_matches_state` | Chưa bán thì chưa có owner; đã bán thì bắt buộc có owner   |
| `ck_products_pending_custodian`   | Chỉ khi đang vận chuyển mới có bên nhận custody đang chờ   |
| `ux_transfer_one_active`          | Mỗi sản phẩm tối đa 1 yêu cầu chuyển quyền REQUESTED       |
| `ux_service_one_open`             | Mỗi sản phẩm tối đa 1 phiếu dịch vụ đang mở                |
| `ux_wallet_one_active_owner`      | Mỗi tổ chức chỉ 1 ví OWNER đang hoạt động                  |
| `ux_wallet_one_active_personal`   | Mỗi người dùng chỉ 1 ví cá nhân đang dùng                  |
| `ux_wallet_one_pending_personal`  | (M2) Mỗi người dùng chỉ 1 yêu cầu liên kết ví đang chờ     |
| `ck_users_session_version_*`      | (M2) Phiên bản phiên đăng nhập không âm                    |
| `warranties_product_id_key`       | Mỗi sản phẩm 1 bảo hành hiện hành                          |
| `ux_blockchain_events_identity`   | Event ghi idempotent theo (chain_id, tx_hash, log_index)   |
| `ck_blockchain_events_finality`   | FINALIZED phải có thời điểm, không bao giờ thành ORPHANED  |
| `ck_users_password_hash_argon2id` | Mật khẩu lưu dạng băm Argon2id                             |
| `trg_audit_logs_append_only`      | `audit_logs` không cho UPDATE/DELETE                       |
| Địa chỉ, hash                     | Lưu chữ thường, đúng 42/66 ký tự hex                       |
| Khoá ngoại                        | `ON DELETE RESTRICT`, không xoá dây chuyền dữ liệu lịch sử |

### Thêm migration mới

Migration của M2: `20261028000000_identity_auth` (thêm `users.session_version` và `ux_wallet_one_pending_personal`). Máy đã chạy M1 chỉ cần `pnpm db:deploy` và `pnpm --filter @dpp/api db:deploy:test`.

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
2. Block finalized sau 2 block và không thể reorg; Indexer chỉ chiếu event sang bảng [P] khi block đã finalized.
3. Ví có số dư dưới 10 MON (reserve balance) có thể bị revert giao dịch chuyển MON; nạp cho ví tổ chức từ 20 MON trở lên trước khi demo nộp phí 8 MON.

## 7. Lệnh thường dùng

| Lệnh                                        | Việc làm                                                           |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm dev`                                  | Chạy API, Worker, Web cùng lúc ở chế độ theo dõi thay đổi          |
| `pnpm build`                                | Build toàn bộ theo đúng thứ tự phụ thuộc                           |
| `pnpm lint` / `pnpm typecheck`              | Kiểm tra lint (oxlint, ESLint) và kiểu                             |
| `pnpm test`                                 | Unit test (shared, api, web) và test contract                      |
| `pnpm test:e2e`                             | Test e2e trên CSDL `dpp_test`                                      |
| `pnpm format` / `pnpm format:check`         | Định dạng mã bằng Prettier                                         |
| `pnpm db:up` / `pnpm db:down`               | Bật / tắt PostgreSQL trong Docker                                  |
| `pnpm db:migrate` / `pnpm db:deploy`        | Tạo migration khi phát triển / áp migration có sẵn                 |
| `pnpm db:studio`                            | Mở Prisma Studio xem dữ liệu                                       |
| `pnpm contracts:compile` / `contracts:test` | Biên dịch / test Smart Contract                                    |
| `pnpm --filter @dpp/contracts deploy:local` | Deploy PartyRegistry lên Hardhat node (`deploy:monad` cho testnet) |
| `pnpm --filter @dpp/contracts abi:export`   | Sinh lại ABI vào `packages/shared/src/abi`                         |
| `pnpm --filter @dpp/api secret:new`         | Sinh `JWT_SECRET`                                                  |
| `pnpm --filter @dpp/api registrar:new`      | Sinh khoá ký giấy phép `REGISTRAR_SIGNER_PRIVATE_KEY`              |

## 8. Test chứng minh traceability

| Test                                                         | Chứng minh                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| `apps/api/src/infrastructure/database/prisma-enums.spec.ts`  | Enum PostgreSQL trùng tên và thứ tự với `@dpp/shared`        |
| `packages/contracts/test/shared/dpp-types.test.ts`           | Enum và role trong Solidity trùng với `@dpp/shared`          |
| `apps/web/src/features/lifecycle/lifecycle-machines.spec.ts` | Giao diện chỉ vẽ bước chuyển mà state machine cho phép       |
| `apps/api/test/database/schema-constraints.e2e-spec.ts`      | Từng ràng buộc CSDL chặn đúng dữ liệu sai                    |
| `packages/contracts/test/registry/party-registry.test.ts`    | ACC-03/04 on-chain: mỗi điều kiện revert có một ca           |
| `packages/contracts/test/shared/abi-export.test.ts`          | ABI dùng ở API/Web trùng contract đã biên dịch               |
| `apps/api/test/identity/auth.e2e-spec.ts`                    | ACC-01/02: Argon2id, cookie, session_version, CSRF           |
| `apps/api/test/identity/wallet-link.e2e-spec.ts`             | ACC-03/04 thật trên Hardhat node: UC → DB → contract → event |

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
| Header hiện sai tên mạng                                  | `NEXT_PUBLIC_CHAIN_ID` phải trùng `CHAIN_ID`; khởi động lại `pnpm dev` sau khi sửa                                                                                                                                                                                                                                                       |
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
