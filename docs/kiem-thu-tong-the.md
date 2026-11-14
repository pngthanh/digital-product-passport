# Kiểm thử tổng thể (M1–M13)

Danh sách kiểm thử từ máy trắng tới hết M13, để chạy một lượt trước khi nộp. Đi theo đúng thứ tự: phần sau dùng dữ liệu phần trước tạo ra. Bước chi tiết của M7–M12 nằm trong `mX-kiem-thu-tay.md`; ở đây chỉ ghi phần cần làm và chỗ cần nhìn.

Có hai cách chạy:

- **Monad Testnet** (chính): cần 6–7 ví MetaMask thử nghiệm có MON. Mất khoảng 2–3 giờ.
- **Hardhat local** (nhanh, không tốn MON): đi theo mục "Chạy với blockchain cục bộ" của README; mục 3 dưới đây vẫn giữ nguyên. Có thể chạy `demo:seed` (mục 4.4) để có ngay dữ liệu bước 1–6 của kịch bản demo.

Gặp lỗi thì ghi theo mẫu ở mục 6 rồi làm tiếp các phần không phụ thuộc vào chỗ lỗi.

## 1. Cài đặt từ đầu

| #   | Việc                                                                                                                                                                                        | Kết quả đúng                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1.1 | Clone repo, `pnpm install`                                                                                                                                                                  | Không lỗi; bước postinstall build `@dpp/shared` và sinh Prisma Client                             |
| 1.2 | `Copy-Item .env.example .env`, chạy `pnpm --filter @dpp/api secret:new` và `registrar:new`, chép vào `.env`                                                                                 | `.env` có `JWT_SECRET`, `REGISTRAR_SIGNER_PRIVATE_KEY`; `git status` không thấy `.env`            |
| 1.3 | `pnpm db:up`, `pnpm db:deploy`, `pnpm --filter @dpp/api db:deploy:test`                                                                                                                     | Docker PostgreSQL chạy; hai CSDL `dpp`, `dpp_test` có đủ migration                                |
| 1.4 | `pnpm --filter @dpp/contracts build`, `pnpm --filter @dpp/contracts test`                                                                                                                   | Biên dịch thành công; mọi test contract đạt                                                       |
| 1.5 | Lưu khoá deploy vào keystore (`pnpm --filter @dpp/contracts exec hardhat keystore set DEPLOYER_PRIVATE_KEY`), deploy 6 bộ contract lên Monad theo README bước 7–7f, chép địa chỉ vào `.env` | Mỗi lệnh in địa chỉ và block deploy; `.env` không chứa khoá riêng                                 |
| 1.6 | `pnpm dev`                                                                                                                                                                                  | Log "API đang chạy", "Worker đã sẵn sàng trên Monad Testnet"; web mở được `http://localhost:3000` |
| 1.7 | Mở `/system/status`                                                                                                                                                                         | CSDL, blockchain (chain 10143), Indexer đều "Hoạt động"; Indexer không chậm                       |

## 2. Test tự động

Chạy ở thư mục gốc, PostgreSQL đang chạy:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test        # 459 unit và contract
pnpm test:e2e    # 128 e2e (tự bật Hardhat node riêng)
pnpm build
```

Kết quả đúng: mọi lệnh thoát mã 0; `pnpm test` và `pnpm test:e2e` báo đủ số test như trên, không có test bị bỏ qua.

## 3. Đi qua toàn bộ chức năng

Chuẩn bị ví (tên gợi ý, dữ liệu giả): **Admin** (ví deploy), **M** (nhà sản xuất), **R** (nhà bán lẻ), **S** (trung tâm bảo hành), **I** (đơn vị kiểm định), **A** và **B** (người dùng). M, R, S, I mỗi ví cần phí đăng ký doanh nghiệp (mặc định 8 MON) cộng khoảng 1 MON gas; A, B cần khoảng 0,3 MON.

### 3.1. M2 – Tài khoản và ví

| #   | Bước                                                                  | Kết quả đúng                                                                  |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 2.1 | Đăng ký 7 tài khoản; thử email trùng (khác hoa thường), mật khẩu ngắn | Email trùng bị báo; mật khẩu yếu bị báo; đăng ký đúng thì vào trang Tài khoản |
| 2.2 | Đăng xuất, đăng nhập sai mật khẩu, rồi đúng                           | Sai: "Email hoặc mật khẩu không đúng."; đúng: vào được                        |
| 2.3 | Cấp quyền Admin: `pnpm --filter @dpp/api admin:grant <email Admin>`   | Tài khoản Admin thấy mục Quản trị sau khi tải lại                             |
| 2.4 | Mỗi tài khoản bấm **Liên kết MetaMask**, ký thông điệp, gửi giao dịch | "Đã liên kết ví thành công."; Admin phải dùng đúng ví deploy                  |
| 2.5 | Với A: đổi sang ví khác (xoay ví), nhập mật khẩu                      | Ví mới thành ví đang dùng, ví cũ ghi "Đã thay"                                |

### 3.2. M3, M4 – Indexer, doanh nghiệp và phí

| #   | Bước                                                                                           | Kết quả đúng                                                                  |
| --- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 4.1 | M nộp đơn Nhà sản xuất kèm phí                                                                 | Đơn "Chờ duyệt", phí "Contract đang giữ"; MonadVision thấy 8 MON vào contract |
| 4.2 | Admin **Quản trị → Doanh nghiệp**: từ chối đơn của M kèm lý do                                 | M thấy lý do; phí "Chờ rút lại"; M rút phí về ví, sửa hồ sơ, nộp lại          |
| 4.3 | Admin duyệt M; R, S, I nộp đơn (Nhà bán lẻ, Trung tâm bảo hành, Đơn vị kiểm định), Admin duyệt | Cả 4 "Đã duyệt"; phí chuyển về ví Treasury                                    |
| 4.4 | Admin mở một doanh nghiệp                                                                      | Mọi lần nộp đơn, hash hồ sơ, nhật ký on-chain có txHash                       |
| 4.5 | Admin đổi phí (ví dụ 5 MON) rồi đổi lại                                                        | Trang Doanh nghiệp và form nộp đơn hiện phí mới sau vài giây                  |

### 3.3. M5, M6 – Sản phẩm, QR, phân phối, bán

| #   | Bước                                                                              | Kết quả đúng                                                                                    |
| --- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 5.1 | M thêm 1 sản phẩm (24 tháng bảo hành) và nhập CSV 3 sản phẩm (một có 0 tháng)     | Mỗi lần một giao dịch; sản phẩm "Mới phát hành"; serial trùng bị báo                            |
| 5.2 | M mở chi tiết sản phẩm, tải QR (PNG, SVG), mở **In tem QR**                       | Tem xếp lưới A4, có mã đọc tay                                                                  |
| 5.3 | `/lookup`: gõ mã, quét bằng camera điện thoại (đặt `PUBLIC_WEB_URL`), tải ảnh tem | Cả ba mở đúng `/p/<mã>`; hồ sơ khớp hash                                                        |
| 6.1 | M gửi 1 sản phẩm cho R, rồi **Huỷ gửi**; gửi lại                                  | Hàng về "Mới phát hành", gửi lại được                                                           |
| 6.2 | R từ chối một lô, nhận một lô                                                     | Từ chối: hàng về M; nhận: "Tại cửa hàng"                                                        |
| 6.3 | R bán cho A (email), cho B; bán sản phẩm 0 tháng cho A                            | A, B thấy trong **Đã mua**; bảo hành 24 tháng đến đúng ngày; sản phẩm 0 tháng không có bảo hành |

### 3.4. M7–M10 – Bảo hành, kiểm định, chuyển nhượng, thu hồi

Làm theo các file chi tiết, dùng S, I, A, B và sản phẩm ở 3.3:

| #   | Phần                                       | File                                       | Trọng tâm                                                                                           |
| --- | ------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 7   | Bảo hành, phiếu sửa                        | [m7-kiem-thu-tay.md](m7-kiem-thu-tay.md)   | Yêu cầu, huỷ, mở phiếu (bảo hành tạm dừng), biên bản kèm ảnh, đóng phiếu, hash khớp; ngoài bảo hành |
| 8   | Kiểm định                                  | [m8-kiem-thu-tay.md](m8-kiem-thu-tay.md)   | Nhà sản xuất và chủ sở hữu gửi yêu cầu; Đạt, Không đạt, từ chối; kết quả công khai                  |
| 9   | Chuyển nhượng                              | [m9-kiem-thu-tay.md](m9-kiem-thu-tay.md)   | A → B: tạo, huỷ, từ chối, quá hạn, chấp nhận; đang sửa thì không chuyển được                        |
| 10  | Thu hồi, báo mất, ngừng sử dụng, thông báo | [m10-kiem-thu-tay.md](m10-kiem-thu-tay.md) | Thu hồi lô ở mọi giai đoạn; khung đỏ công khai; báo mất; chuông thông báo                           |

### 3.5. M11 – Xác minh công khai

[m11-kiem-thu-tay.md](m11-kiem-thu-tay.md): khớp blockchain, tự kiểm bằng trình duyệt, không lộ ví người mua, sửa tay CSDL thì lệch và có đúng một cảnh báo, giới hạn lượt tra cứu.

### 3.6. M12 – Quản trị, cảnh báo, nhật ký

[m12-kiem-thu-tay.md](m12-kiem-thu-tay.md): Tổng quan khớp số liệu đã tạo ở trên (4 doanh nghiệp, số sản phẩm theo trạng thái, giao dịch theo hàm); cảnh báo `PUBLIC_VERIFICATION_MISMATCH` từ bước M11 nằm trong **Cảnh báo**, chốt "Đã xử lý" kèm ghi chú; đăng nhập sai dồn dập; lọc nhật ký.

## 4. M13 – Hiệu năng, độ bền, demo

| #   | Việc                                                                         | Kết quả đúng                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | Hardhat node ở cửa sổ riêng, `pnpm --filter @dpp/contracts bench:local`      | Khoảng 10 giây; "Xong 20/20 vòng"; `docs/benchmark/hardhat-local.md` có 15 dòng hàm, phần lô, thông lượng, deploy                                                                                               |
| 4.2 | `pnpm --filter @dpp/api bench:baseline`                                      | `docs/benchmark/postgres-baseline.md`; schema `bench_baseline` không còn trong CSDL sau khi chạy                                                                                                                |
| 4.3 | `pnpm --filter @dpp/contracts bench:monad` (chưa đặt `BENCH_CONFIRM`)        | In số dư, giá gas, ước tính; báo "Chưa chạy"; không gửi giao dịch nào. Muốn chạy thật: xem [m13-benchmark-hardening.md](m13-benchmark-hardening.md) mục 2                                                       |
| 4.4 | Trên Hardhat local sạch: làm theo [demo-kich-ban.md](demo-kich-ban.md) mục 1 | `demo:seed` dựng bước 1–6; bước 7–13 trên web đúng như bảng; `demo:reverts` lần lượt ra `TransferAlreadyActive`, `NotProductOwner`, `NotAuthorizedServiceCenter`; **Quản trị → Cảnh báo** không có cảnh báo nào |
| 4.5 | Chạy lại `demo:seed` khi chưa làm sạch CSDL                                  | Dừng ngay, báo tài khoản đã có và cách làm sạch; không tạo dữ liệu nửa chừng                                                                                                                                    |
| 4.6 | `demo:seed` khi `.env` trỏ Monad                                             | Từ chối chạy (chỉ chạy với chain 31337)                                                                                                                                                                         |

## 5. Kiểm tra cuối

| #   | Việc                                                              | Kết quả đúng                                                            |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 5.1 | Điện thoại (cùng Wi-Fi): mở trang chủ, hộ chiếu, Đã mua, Quản trị | Không có trang nào bị kéo ngang; nút bấm được                           |
| 5.2 | Bật chế độ tối của hệ điều hành                                   | Mọi trang đọc được; biểu đồ Tổng quan đổi màu theo                      |
| 5.3 | `git status`                                                      | Không có `.env`, khoá, file tạm; chỉ có file thuộc dự án                |
| 5.4 | Mở `/system/status` sau khi làm xong                              | Indexer bắt kịp; không có giao dịch treo trong **Quản trị → Tổng quan** |

## 6. Mẫu báo lỗi

```
Bước: 3.3 / 6.2 (hoặc mX-kiem-thu-tay.md bước N)
Tài khoản và ví: R, 0x12…ab
Làm gì: …
Thấy gì: … (ảnh chụp màn hình)
Đúng ra phải: …
Log: dòng lỗi trong cửa sổ pnpm dev (API hoặc Worker), F12 → Console nếu có
txHash (nếu có): 0x…
```
