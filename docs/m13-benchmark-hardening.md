# M13 – Đo hiệu năng, kiểm thử độ bền và demo

M13 khép lại đồ án bằng ba việc theo tài liệu phân tích gốc:

- **Mục 23, benchmark**: đo gas, phí MON, độ trễ và thông lượng của các hàm contract chính trên Hardhat và Monad Testnet; dựng đường cơ sở PostgreSQL + chữ ký ECDSA để so với lưu trữ tập trung.
- **Mục 21, kiểm thử**: thêm test cho các ca còn thiếu (reorg trên node thật, quét lại từ đầu sau sự cố, khoá trung tâm bảo hành) và lập bảng ánh xạ từng ca kiểm thử sang test tự động.
- **Mục 22, demo**: script dựng sẵn bước 1–6 trên Hardhat local, script chứng minh contract từ chối ở bước 9, 11, 12, và danh sách việc khi demo trên Monad Testnet ([demo-kich-ban.md](demo-kich-ban.md)).

M13 không đổi contract, không có migration, không đổi giao diện.

| Thành phần            | Lệnh                                                       | Kết quả                                                                                      |
| --------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Benchmark contract    | `pnpm --filter @dpp/contracts bench:local` / `bench:monad` | `docs/benchmark/<mạng>.md`, `.json`                                                          |
| Đường cơ sở tập trung | `pnpm --filter @dpp/api bench:baseline`                    | `docs/benchmark/postgres-baseline.md`, `.json`                                               |
| Dựng dữ liệu demo     | `pnpm --filter @dpp/api demo:seed`                         | 7 tài khoản, 3 doanh nghiệp, laptop `ABC-2026-000128` đã bán và đã sửa                       |
| Contract từ chối      | `pnpm --filter @dpp/api demo:reverts <mã>`                 | Lỗi contract của bước 9, 11, 12 (gọi thử, không tốn MON)                                     |
| Test độ bền           | `pnpm test:e2e`                                            | `test/hardening/reorg.e2e-spec.ts`, ca quét lại trong `test/lifecycle/lifecycle.e2e-spec.ts` |

## 1. Quyết định thiết kế

| Mã   | Quyết định                                                                                                                                                                                                                                                                                                                                                                                            | Lý do                                                                                                                                                                                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D97  | **Benchmark deploy bộ 7 contract riêng** cùng khoá registrar tạm và ví tạm. Không dùng contract của hệ thống; Indexer không theo dõi các contract này.                                                                                                                                                                                                                                                | Đo trên contract thật mà không làm bẩn dữ liệu và không sinh cảnh báo lệch.                                                                                                                                                      |
| D98  | **Gửi giao dịch giống web**: gas limit bằng ước lượng cộng 10%. Trên Monad, phí bằng gas limit × giá gas; trên mạng khác, phí bằng gas đã dùng × giá gas.                                                                                                                                                                                                                                             | Monad tính phí theo gas limit ([tài liệu Monad](https://docs.monad.xyz/developer-essentials/gas-pricing)), nên phí đo được chính là phí người dùng web trả.                                                                      |
| D99  | **Đo hai mốc độ trễ**: từ lúc ký và gửi tới lúc có biên nhận, và tới lúc block chứa giao dịch được finalized. Script tự hỏi RPC mỗi 150 ms.                                                                                                                                                                                                                                                           | Chu kỳ hỏi mặc định của ethers (vài giây) sẽ làm tròn số đo. Mốc finalized là lúc Worker của hệ thống chốt dữ liệu.                                                                                                              |
| D100 | **Giới hạn chi `BENCH_MAX_MON`** (mặc định 2). Trước khi gửi mỗi lệnh, script kiểm tra tổng phí cộng phí tối đa của lệnh. Từ vòng thứ 4, script giữ lại phần cho phép đo lô và thông lượng. Hết ngân sách thì dừng sớm, báo cáo ghi số vòng đã chạy. Mọi MON còn trong ví tạm được trả về ví deploy, kể cả khi dừng vì lỗi. Trên mạng thật, script chỉ in ước tính cho tới khi đặt `BENCH_CONFIRM=1`. | Chạy trọn 20 vòng trên Monad tốn khoảng 4,8 MON, cao hơn mức 1–2 MON dự tính ban đầu: riêng deploy đã dùng khoảng 9,9 triệu gas, tức khoảng 1 MON ở giá sàn 100 gwei. Giới hạn chi giúp không tiêu quá số MON đang có.           |
| D101 | **Đường cơ sở tập trung** chạy trong schema riêng `bench_baseline` của CSDL phát triển và xoá schema khi xong. Mỗi việc ghi một giao dịch CSDL, ký ECDSA secp256k1 trên keccak256 (giống blockchain), kiểm chữ ký bằng cách khôi phục địa chỉ ký.                                                                                                                                                     | So đúng cùng việc, cùng thuật toán ký; không đụng bảng của hệ thống.                                                                                                                                                             |
| D102 | **Test reorg trên Hardhat node thật** bằng `evm_snapshot`/`evm_revert`. Test thay `CHAIN_READER` của Worker bằng bản đọc chain thật, nhưng coi block finalized lùi 3 block so với block mới nhất.                                                                                                                                                                                                     | Hardhat coi mọi block là finalized nên không thể reorg phần chưa finalized. Lùi 3 block mô phỏng mạng có độ trễ finality. Logic reorg của Indexer đã có unit test từ M3; M13 chạy lại logic đó với log, hash block và CSDL thật. |
| D103 | **Test quét lại từ block deploy** chạy trên kịch bản M10 (6 contract, đủ phát hành, giao, bán, sửa, chuyển nhượng, thu hồi, báo mất). Test lùi mốc của mọi contract về block deploy, quét lại, rồi so toàn bộ dữ liệu đã chiếu trước và sau.                                                                                                                                                          | Đây là ca "Indexer gián đoạn, khởi động lại, nhận lại log trùng" của Mục 21.2, với nhiều loại event nhất.                                                                                                                        |
| D104 | **Dữ liệu demo đi qua API và contract thật**, như người dùng bấm trên web; ví Hardhat #0–#6 đóng vai MetaMask. Script chỉ chạy khi RPC là chain 31337. Mật khẩu lấy từ `DEMO_PASSWORD`, không ghi trong mã. `demo:reverts` dùng `eth_call` (không gửi giao dịch) nên chạy được cả trên Monad mà không tốn MON.                                                                                        | Dữ liệu demo nhất quán giữa CSDL, chain và nhật ký kiểm toán. Không có khoá hay mật khẩu thật trong repo.                                                                                                                        |

## 2. Chạy benchmark

```powershell
# Hardhat local: cửa sổ 1 chạy node, cửa sổ 2 chạy benchmark (vài giây, không tốn MON thật)
pnpm --filter @dpp/contracts node
pnpm --filter @dpp/contracts bench:local

# Monad Testnet: lần đầu chỉ in ước tính và số dư, chưa gửi gì
pnpm --filter @dpp/contracts bench:monad
# Đồng ý thì chạy thật (ví deploy trong keystore Hardhat phải có MON)
$env:BENCH_CONFIRM="1"; $env:BENCH_MAX_MON="5"; pnpm --filter @dpp/contracts bench:monad

# Đường cơ sở PostgreSQL (CSDL dev đang chạy)
pnpm --filter @dpp/api bench:baseline
```

Ước tính chi phí trên Monad, tính bằng gas đo trên Hardhat nhân giá sàn 100 gwei. Gas thật trên Monad có thể cao hơn, vì Monad tính truy cập lạnh và `ecrecover` đắt hơn Ethereum ([tài liệu Monad](https://docs.monad.xyz/developer-essentials/opcode-pricing.md)). Script in lại ước tính theo giá gas lúc chạy.

| Cách chạy                            | Chạy được                                           | Ước tính       |
| ------------------------------------ | --------------------------------------------------- | -------------- |
| Mặc định `BENCH_MAX_MON=2`           | Khoảng 3 vòng và phần đo lô; bỏ phần đo thông lượng | ≤ 2 MON        |
| `BENCH_RUNS=10`, `BENCH_MAX_MON=3.5` | 10 vòng, lô, thông lượng                            | khoảng 3,3 MON |
| `BENCH_MAX_MON=5` (20 vòng mặc định) | Trọn kế hoạch                                       | khoảng 4,8 MON |

Ví deploy cần nhiều hơn `BENCH_MAX_MON` khoảng 0,7 MON. Đây là tiền nạp tạm cho ví tạm và được trả lại khi xong. Kết quả ghi vào `docs/benchmark/monad-testnet.md`; commit file này cùng báo cáo.

## 3. Kết quả

### 3.1. Gas từng hàm (Hardhat local, 20 lần mỗi hàm)

Gas không phụ thuộc mạng chạy EVM giống Ethereum, nên dùng được để so các hàm với nhau. Cột cuối là phí tối thiểu nếu chạy trên Monad với gas như Hardhat. Bảng đầy đủ (gồm độ trễ, độ lệch chuẩn, deploy): [benchmark/hardhat-local.md](benchmark/hardhat-local.md).

| Hàm (tên trong Mục 23)                                               |  Gas dùng | Gas limit (+10%) | Phí tối thiểu trên Monad (MON) |
| -------------------------------------------------------------------- | --------: | ---------------: | -----------------------------: |
| `PartyRegistry.registerUser` (liên kết ví)                           |    99.576 |          109.532 |                         0,0110 |
| `PartyRegistry.applyOrganization`                                    |   175.992 |          193.591 |                         0,0194 |
| `PartyRegistry.approveOrganization`                                  |    37.714 |           46.995 |                         0,0047 |
| `ProductPassport.registerProducts`, 1 sản phẩm (createProduct)       |   116.662 |          128.328 |                         0,0128 |
| `ProductPassport.registerProducts`, lô 20 sản phẩm                   | 1.460.252 |        1.606.277 |   0,1606 (0,0080 mỗi sản phẩm) |
| `ProductPassport.dispatchCustody` (transferCustody, bước gửi)        |    75.500 |           83.050 |                         0,0083 |
| `ProductPassport.confirmCustodyReceipt` (transferCustody, bước nhận) |    67.962 |           80.306 |                         0,0080 |
| `ProductPassport.sellAndActivateWarranty`                            |   147.572 |          163.596 |                         0,0164 |
| `ServiceTicketManager.openTicket` (recordServiceEvent, mở phiếu)     |   184.053 |          203.248 |                         0,0203 |
| `ServiceTicketManager.closeTicket` (recordServiceEvent, đóng phiếu)  |    82.400 |           96.304 |                         0,0096 |
| `InspectionRegistry.recordInspection`                                |   199.275 |          219.203 |                         0,0219 |
| `OwnershipTransfer.createTransferRequest`                            |   183.363 |          201.699 |                         0,0202 |
| `OwnershipTransfer.acceptTransfer`                                   |    70.214 |           82.666 |                         0,0083 |
| `ProductLifecycle.recallProducts`, 1 sản phẩm                        |    96.178 |          106.208 |                         0,0106 |
| `ProductLifecycle.recallProducts`, lô 20 sản phẩm                    |   997.225 |        1.098.017 |   0,1098 (0,0055 mỗi sản phẩm) |

Nhận xét:

- Một sản phẩm đi từ phát hành tới tay người mua (đăng ký, gửi, nhận, bán) tốn 455.280 gas limit, tức khoảng 0,046 MON trên Monad ở giá sàn.
- Đăng ký theo lô rẻ hơn 37% mỗi sản phẩm (73.013 so với 116.662 gas); thu hồi theo lô rẻ hơn 48%. Phần chi phí cố định (kiểm chữ ký giấy phép, kiểm quyền) được chia cho cả lô.
- Ba hàm đắt nhất (`recordInspection`, `openTicket`, `createTransferRequest`) đều kiểm chữ ký EIP-712 của registrar và đọc chéo sang 2–3 contract khác. Trên Monad, phần đọc chéo này đắt hơn Ethereum, nên gas thật trên Monad có thể cao hơn bảng.
- Deploy 7 contract dùng 9.913.895 gas, tức khoảng 1 MON trên Monad. Đây là chi phí một lần.

### 3.2. Độ trễ và thông lượng

Trên Hardhat local, block được đào ngay khi có giao dịch, nên độ trễ (12–15 ms) chỉ là thời gian xử lý của máy. Thông lượng 107 giao dịch/giây là giới hạn của node local, không phản ánh mạng thật. Số đo trên Monad Testnet nằm ở `docs/benchmark/monad-testnet.md` sau khi chạy `bench:monad`. File này có độ trễ tới biên nhận và tới finalized (trung bình, p95, độ lệch chuẩn) cho từng hàm, và thông lượng khi gửi 20 giao dịch liền nhau từ một ví.

### 3.3. Đường cơ sở PostgreSQL + chữ ký ECDSA

Số đo trên máy phát triển, PostgreSQL 16, mỗi việc 20 lần. Bảng đầy đủ: [benchmark/postgres-baseline.md](benchmark/postgres-baseline.md).

| Việc                              | Tương ứng trên blockchain                                             | TB (ms) | p95 (ms) |
| --------------------------------- | --------------------------------------------------------------------- | ------: | -------: |
| Ghi hồ sơ sản phẩm + ký           | `registerProducts`                                                    |    2,35 |     3,06 |
| Đổi trạng thái + ghi nhật ký + ký | `dispatchCustody`, `confirmCustodyReceipt`, `sellAndActivateWarranty` |    1,89 |     2,62 |
| Đọc nhật ký + kiểm mọi chữ ký     | Tự kiểm hộ chiếu (M11)                                                |    8,72 |    11,43 |

Lô 20 hồ sơ trong một giao dịch CSDL mất 19,9 ms. Ghi tuần tự 1.000 hồ sơ mất 1,68 giây (596 hồ sơ mỗi giây). Không có phí giao dịch.

### 3.4. So sánh

| Tiêu chí                     | Blockchain (Monad Testnet)                                | PostgreSQL + ECDSA                                                               |
| ---------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Thời gian ghi một sự kiện    | Xem `monad-testnet.md` (tới biên nhận và tới finalized)   | 2–3 ms                                                                           |
| Phí mỗi sự kiện              | 0,008–0,022 MON tuỳ hàm (giá sàn)                         | 0; chỉ có chi phí máy chủ                                                        |
| Sửa sự kiện đã ghi           | Không sửa được, kể cả Admin; mọi bên tự đọc chain để kiểm | Bên giữ CSDL và khoá ký sửa được: sửa rồi ký lại thì người ngoài không phát hiện |
| Người xem tự kiểm            | Có: trình duyệt tự đọc contract (M11)                     | Phải tin khoá công khai và máy chủ do chính bên đó công bố                       |
| Khi hệ thống ngừng hoạt động | Hộ chiếu vẫn kiểm được trên explorer                      | Mất cả dữ liệu lẫn bằng chứng                                                    |

Lưu trữ tập trung nhanh hơn và gần như miễn phí. Đổi lại, toàn bộ niềm tin dồn vào bên vận hành. Blockchain tốn phí cho mỗi sự kiện và chậm hơn, nhưng các bên không cần tin nhau. Vì vậy hệ thống chỉ ghi lên chain những gì cần bất biến (hash hồ sơ, trạng thái, quyền sở hữu, hash biên bản); phần còn lại để ở CSDL (Mục 2 của tài liệu phân tích).

## 4. Kiểm thử độ bền

| Test                                                                          | Chứng minh                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/test/hardening/reorg.e2e-spec.ts`                                   | Trên Hardhat node, finality trễ 3 block. (1) Liên kết ví ở block chưa finalized: event ghi PENDING, ví chưa kích hoạt. Reorg mất block đó: event thành ORPHANED, không chiếu, không có nhật ký `WALLET_ACTIVATED`, không cảnh báo. (2) Gửi lại vào block khác: chốt đúng một lần, ví ACTIVE, event cũ vẫn ORPHANED. |
| `apps/api/test/lifecycle/lifecycle.e2e-spec.ts`, ca cuối                      | Sau trọn kịch bản M10, lùi mốc của mọi contract về block deploy rồi quét lại. Event, trạng thái sản phẩm, bảo hành, phiếu sửa, chuyển nhượng, nhật ký kiểm toán, thông báo, lịch sử giữ hàng, chủ sở hữu, thu hồi và cảnh báo đều giữ nguyên từng dòng.                                                             |
| `packages/contracts/test/service/service-ticket-manager.test.ts`, ca Mục 21.2 | Admin khoá trung tâm bảo hành sau khi trung tâm đã đóng phiếu: phiếu cũ giữ nguyên trạng thái, trung tâm và hash biên bản; trung tâm không mở được phiếu mới.                                                                                                                                                       |

## 5. Ánh xạ ca kiểm thử Mục 21 sang test tự động

### 5.1. Ca cơ bản

| Ca kiểm thử                                                                 | Test                                                                                                                                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nhà sản xuất được duyệt tạo sản phẩm mới → thành công                       | `product-passport.test.ts`: "nhà sản xuất đã duyệt đăng ký một sản phẩm"; `products.e2e-spec.ts`: "PRD-01"                                                         |
| Tổ chức chưa được duyệt tạo sản phẩm → contract từ chối                     | `product-passport.test.ts`: "đơn nhà sản xuất chưa được duyệt hoặc đã bị khoá thì không đăng ký được"; `products.e2e-spec.ts`: "chưa là nhà sản xuất được duyệt"   |
| Trùng serial/productId → từ chối                                            | `product-passport.test.ts`: "mỗi productId chỉ đăng ký một lần, kể cả trùng trong cùng một lô"; `products.e2e-spec.ts`: "serial đã dùng thì 409"                   |
| Nhà bán lẻ kích hoạt bảo hành, chuyển chủ lần đầu                           | `product-distribution.test.ts`: "DST-03 bán và kích hoạt bảo hành"; `distribution.e2e-spec.ts`: "DST-03"                                                           |
| Trung tâm bảo hành hợp lệ ghi sửa chữa → thành công                         | `service-ticket-manager.test.ts`: "SVC-03", "SVC-04"; `service.e2e-spec.ts`: "SVC-03", "SVC-04"                                                                    |
| Người dùng thường ghi sửa chữa → từ chối                                    | `service-ticket-manager.test.ts`: "chỉ ví đại diện trung tâm bảo hành đã duyệt mới mở được"; `demo:reverts` bước 12                                                |
| Sửa file biên bản sau khi đã ghi hash → không khớp                          | `service.e2e-spec.ts`: "sửa biên bản trong CSDL thì không còn khớp hash on-chain"; `inspection.e2e-spec.ts`: ca tương tự cho biên bản kiểm định                    |
| A chuyển cho B, B xác nhận → chủ đổi A → B                                  | `ownership-transfer.test.ts`: "TRF-01, TRF-03"; `transfer.e2e-spec.ts`: "TRF-01, TRF-03"                                                                           |
| A chuyển lại sau khi mất quyền → từ chối                                    | `ownership-transfer.test.ts`: "chỉ chủ sở hữu tạo được"; `demo:reverts` bước 11                                                                                    |
| Thực thi lại yêu cầu đã COMPLETED → từ chối                                 | `ownership-transfer.test.ts`: "TRF-02, TRF-04: … yêu cầu đã đóng không đổi được nữa"                                                                               |
| Sản phẩm bị thu hồi → trang xác minh cảnh báo, chặn chuyển quyền            | `product-lifecycle.test.ts`: "thu hồi là trạng thái cuối"; `lifecycle.e2e-spec.ts`: "RCL-01", "yêu cầu chuyển nhượng của sản phẩm đã thu hồi không chấp nhận được" |
| Người mua quét QR → timeline phát hành, bán, bảo hành, sửa chữa, chuyển chủ | `distribution.e2e-spec.ts`: "hộ chiếu công khai"; `service.e2e-spec.ts`: "hành trình và hộ chiếu công khai có bước sửa chữa"; `verification.e2e-spec.ts`: "VER-02" |

### 5.2. Ca biên

| Ca kiểm thử                                                                | Test                                                                                                                                                  |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| A gửi hai yêu cầu chuyển quyền gần như đồng thời → chỉ một thành công      | `ownership-transfer.test.ts`: "mỗi sản phẩm một yêu cầu mở" (`TransferAlreadyActive`); `demo:reverts` bước 9                                          |
| B từ chối → REJECTED, chủ không đổi, A tạo lại được                        | `ownership-transfer.test.ts`: "TRF-02, TRF-04"; `transfer.e2e-spec.ts`: "TRF-04, TRF-02"                                                              |
| A huỷ trước khi B chấp nhận → CANCELLED                                    | Như trên                                                                                                                                              |
| Yêu cầu hết hạn → EXPIRED, A tạo lại được                                  | `ownership-transfer.test.ts`: "TRF-05", "yêu cầu quá hạn tự đóng khi tạo yêu cầu mới"; `transfer.e2e-spec.ts`: "TRF-05"                               |
| Nhà bán lẻ nhận hàng không phát sinh đổi chủ                               | `product-distribution.test.ts`: "nhà bán lẻ được giao xác nhận: AT_RETAIL, nhà bán lẻ thành bên giữ hàng"                                             |
| Admin khoá trung tâm bảo hành → phiếu cũ còn nguyên                        | `service-ticket-manager.test.ts`: "Mục 21.2: Admin khoá trung tâm sau khi đã ghi phiếu" (M13)                                                         |
| Tổ chức đổi ví khi có giao dịch chờ → ví cũ bị từ chối, lịch sử giữ nguyên | `product-passport.test.ts`: "người đại diện đổi ví (ACC-04) thì ví mới đăng ký được, ví cũ không còn quyền"; `party-registry.test.ts`: "rotateWallet" |
| Indexer gián đoạn, nhận lại log trùng → không ghi trùng                    | `indexer.e2e-spec.ts`: "chạy Indexer lại không tạo event hay audit trùng"; `lifecycle.e2e-spec.ts`: "M13: Worker quét lại từ block deploy"            |
| Reorg ở block chưa finalized → không chốt, sau đó khớp nhánh cuối          | `index-chain-events.spec.ts`: "reorg"; `reorg.e2e-spec.ts` (M13, node thật)                                                                           |

## 6. Test chứng minh M13

| Test                                                             | Chứng minh                                                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/test/hardening/reorg.e2e-spec.ts`                      | 2 ca reorg trên node thật (mục 4)                                                                                               |
| `apps/api/test/lifecycle/lifecycle.e2e-spec.ts`                  | Thêm 1 ca quét lại từ block deploy                                                                                              |
| `packages/contracts/test/service/service-ticket-manager.test.ts` | Thêm 1 ca khoá trung tâm bảo hành                                                                                               |
| `pnpm --filter @dpp/contracts bench:local`                       | Chạy trọn 20 vòng × 11 lệnh, lô, thông lượng; trả MON thừa; ghi báo cáo                                                         |
| `pnpm --filter @dpp/api demo:seed`, `demo:reverts`               | Đã chạy trên Hardhat local sạch: dựng bước 1–6 trong khoảng 20 giây, không có cảnh báo bất thường; bước 7–13 chạy đúng trên web |
