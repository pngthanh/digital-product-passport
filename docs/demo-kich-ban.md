# Kịch bản demo khi báo cáo

Theo Mục 22 của tài liệu phân tích: 13 bước, từ duyệt doanh nghiệp tới tra cứu công khai. Có hai cách demo:

- **Hardhat local** (mục 1): một lệnh dựng sẵn bước 1–6, bước 7–13 làm trực tiếp trên web. Không cần Internet, không tốn MON, làm lại được bao nhiêu lần cũng được. Nên dùng khi trình bày.
- **Monad Testnet** (mục 2): làm cả 13 bước bằng MetaMask trên mạng thật, mở từng giao dịch trên MonadVision. Dùng khi hội đồng muốn xem mạng thật, hoặc quay video trước.

Tên và email trong kịch bản là dữ liệu giả. Không dùng ví hay khoá thật cho demo local.

## 1. Demo trên Hardhat local

### 1.1. Chuẩn bị (một lần, khoảng 10 phút)

```powershell
# Giữ cấu hình Monad để quay lại sau demo (.env.* không bị commit)
Copy-Item .env .env.monad

# Cửa sổ 1: Hardhat node (chain 31337). Để cửa sổ này mở suốt buổi demo.
pnpm --filter @dpp/contracts node
```

Ở cửa sổ 2, làm đúng phần "Chạy với blockchain cục bộ" của README: sửa `CHAIN_ID=31337`, `RPC_URL=http://127.0.0.1:8545`, `RPC_FALLBACK_URL=`; chạy 6 lệnh `deploy:*:local` và chép địa chỉ, block deploy vào `.env`. Sau đó:

```powershell
# Làm sạch CSDL dev (mốc quét của Indexer phải bắt đầu từ chain mới)
pnpm --filter @dpp/api db:reset
pnpm dev
# Chờ log "Worker đã sẵn sàng trên Hardhat Local"

# Cửa sổ 3: dựng bước 1–6 (khoảng 20 giây). Mật khẩu chung của 7 tài khoản demo do bạn đặt:
$env:DEMO_PASSWORD="<mật khẩu từ 10 ký tự>"
pnpm --filter @dpp/api demo:seed
```

Script in ra 7 tài khoản, ví Hardhat tương ứng và link hộ chiếu công khai của laptop `ABC-2026-000128`. Ghi lại link và mật khẩu ra giấy (đừng lưu vào repo).

| Ví Hardhat | Email                      | Vai trò                            |
| ---------- | -------------------------- | ---------------------------------- |
| #0         | `admin@demo.dpp.vn`        | Admin (ví deploy contract)         |
| #1         | `sanxuat@abc.demo.vn`      | Đại diện Công ty TNHH Sản xuất ABC |
| #2         | `cuahang@abc.demo.vn`      | Đại diện Cửa hàng Điện máy ABC     |
| #3         | `baohanh@abc.demo.vn`      | Đại diện Trung tâm Bảo hành ABC    |
| #4         | `nguoidung.a@demo.dpp.vn`  | Người dùng A (đang sở hữu laptop)  |
| #5         | `nguoimua.b@demo.dpp.vn`   | Người mua B                        |
| #6         | `taikhoan.gia@demo.dpp.vn` | Tài khoản giả (người dùng thường)  |

MetaMask: thêm mạng RPC `http://127.0.0.1:8545`, chain ID `31337`, ký hiệu `ETH`. Import khoá riêng của tài khoản Hardhat **#4 và #5** (Hardhat node in ra khi khởi động; đây là khoá công khai, chỉ dùng cục bộ). Mỗi lần dựng lại Hardhat node, vào MetaMask → Settings → Advanced → Clear activity tab data để không lệch nonce.

Nên mở sẵn hai cửa sổ trình duyệt: cửa sổ thường đăng nhập A (MetaMask chọn ví #4), cửa sổ ẩn danh (hoặc trình duyệt khác) cho B (ví #5).

### 1.2. Đã có sẵn sau `demo:seed` (bước 1–6)

| Bước | Tài khoản               | Đã làm                                                                   | Chỉ cho hội đồng                                                                                                             |
| ---- | ----------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 1    | Admin                   | Duyệt Nhà sản xuất ABC, Cửa hàng ABC, Trung tâm Bảo hành ABC             | Đăng nhập Admin → **Quản trị → Doanh nghiệp → Đã duyệt**: 3 doanh nghiệp, mở một doanh nghiệp xem giao dịch nộp đơn và duyệt |
| 2    | Nhà sản xuất            | Phát hành laptop `ABC-2026-000128`                                       | Hộ chiếu công khai: dòng "Nhà sản xuất phát hành hộ chiếu" kèm txHash                                                        |
| 3    | Nhà sản xuất → Cửa hàng | Gửi hàng, cửa hàng xác nhận nhận (AT_RETAIL)                             | Dòng "Gửi hàng cho nhà bán lẻ", "Nhà bán lẻ nhận hàng"                                                                       |
| 4    | Cửa hàng                | Bán cho A, kích hoạt bảo hành 24 tháng                                   | Dòng "Bán cho người dùng", "Kích hoạt bảo hành"                                                                              |
| 5    | Người dùng A            | (làm trực tiếp)                                                          | A đăng nhập → **Đã mua** → laptop: A là chủ, còn bảo hành tới ngày bán + 24 tháng                                            |
| 6    | Trung tâm bảo hành      | Nhận yêu cầu "SSD sắp hỏng", mở phiếu, thay SSD, đóng phiếu kèm biên bản | Dòng "Tiếp nhận sửa chữa", "Sửa xong"; trang Trung tâm (đăng nhập `baohanh@…`) có biên bản và hash khớp on-chain             |

### 1.3. Làm trực tiếp (bước 7–13)

| Bước | Ai                                | Thao tác                                                                                                                                                                                | Kết quả đúng                                                                                                                                                                                                                                                   |
| ---- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7    | Người mua B (không cần đăng nhập) | Mở link hộ chiếu công khai (hoặc quét QR ở trang **Tra cứu**)                                                                                                                           | Timeline: phát hành, gửi, nhận, bán, bảo hành, tiếp nhận sửa, sửa xong, mỗi dòng có txHash. Khung **Đối chiếu blockchain**: Khớp blockchain. Bấm **Tự kiểm tra bằng trình duyệt**: các mục đều có dấu tích. Chủ sở hữu hiện "Đã có chủ (không hiện danh tính)" |
| 8    | A                                 | **Đã mua** → laptop → phần Chuyển nhượng: nhập `nguoimua.b@demo.dpp.vn`, **Kiểm tra** (hiện Trần Thị B), **Gửi yêu cầu chuyển nhượng**, ký MetaMask                                     | Hiện "Yêu cầu #1", chờ bên nhận. Form gửi yêu cầu mới biến mất                                                                                                                                                                                                 |
| 9    | A (ca biên)                       | Nói: web đã ẩn form. Chứng minh ở tầng contract: cửa sổ 3 chạy `pnpm --filter @dpp/api demo:reverts <mã>`                                                                               | Dòng bước 9/11: `TransferAlreadyActive`: contract từ chối vì sản phẩm đang có yêu cầu chưa đóng (bất biến Mục 10)                                                                                                                                              |
| 10   | B                                 | Đăng nhập B → **Chuyển nhượng** → yêu cầu gửi tới bạn → **Chấp nhận**, ký MetaMask                                                                                                      | Vài giây sau, laptop có trong **Đã mua** của B; bảo hành đi theo sản phẩm                                                                                                                                                                                      |
| 11   | A                                 | Tải lại trang laptop của A; chạy lại `demo:reverts <mã>`                                                                                                                                | Trang báo không tìm thấy (A không còn là chủ). Script báo `NotProductOwner`                                                                                                                                                                                    |
| 12   | Tài khoản giả                     | Đăng nhập `taikhoan.gia@…`: menu không có mục bảo hành; mở `/service` thấy "Chỉ người đại diện của trung tâm bảo hành mới có trang này". Chỉ thêm kết quả `demo:reverts` (dòng bước 12) | `NotAuthorizedServiceCenter`: contract từ chối ví không thuộc trung tâm bảo hành đã duyệt                                                                                                                                                                      |
| 13   | Trang công khai                   | Tải lại hộ chiếu công khai; bấm một txHash; mở **Nhật ký giao dịch on-chain**                                                                                                           | Thêm dòng "Chuyển quyền sở hữu", tab Chuyển nhượng có 2 mục; vẫn Khớp blockchain; ví của doanh nghiệp hiện, ví người dùng cá nhân không hiện                                                                                                                   |

Phần thêm nếu còn thời gian: Admin mở **Quản trị → Tổng quan** (số liệu, biểu đồ event, giao dịch theo hàm), **Nhật ký** (lọc "Chuyển nhượng"), **Cảnh báo** (thử đăng nhập sai 10 lần một email rồi chờ Worker quét, xem [m12-kiem-thu-tay.md](m12-kiem-thu-tay.md)).

### 1.4. Sau demo

```powershell
# Quay lại cấu hình Monad
Copy-Item .env.monad .env -Force
pnpm --filter @dpp/api db:reset   # CSDL dev đang chứa dữ liệu chain local
pnpm dev                          # Worker quét lại Monad từ block deploy
```

`db:reset` xoá dữ liệu Monad đã chiếu trong CSDL dev. Dữ liệu trên Monad vẫn còn: Worker quét lại từ block deploy và dựng lại doanh nghiệp, sản phẩm, lịch sử. Tài khoản web (email, mật khẩu) thì phải đăng ký lại. Muốn giữ nguyên tài khoản Monad, dùng một CSDL riêng cho demo: tạo database `dpp_demo` rồi đặt `DATABASE_URL` trong `.env` local trỏ tới nó.

## 2. Demo trên Monad Testnet (danh sách việc)

### 2.1. Chuẩn bị trước buổi demo (một ngày trước)

| #   | Việc                                                                                                                       | Ghi chú                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 6 ví MetaMask thử nghiệm (Nhà sản xuất, Cửa hàng, Trung tâm, A, B, Tài khoản giả) và ví Admin (ví đã deploy PartyRegistry) | Ví mới, chỉ dùng cho testnet. Không dùng ví chứa tài sản thật                                                                                                          |
| 2   | Mỗi ví có MON từ faucet.monad.xyz                                                                                          | Nhà sản xuất, Cửa hàng, Trung tâm: mỗi ví đủ phí đăng ký doanh nghiệp hiện hành (mặc định 8 MON) cộng khoảng 0,5 MON gas. A, B, Tài khoản giả: 0,2 MON. Admin: 0,2 MON |
| 3   | Đăng ký 6 tài khoản web, liên kết đúng ví                                                                                  | Admin: tài khoản đã cấp quyền bằng `admin:grant`                                                                                                                       |
| 4   | Làm trước bước 1–4 (nộp đơn, duyệt, phát hành, gửi, nhận, bán cho A)                                                       | Mỗi bước 1–3 giao dịch; mất khoảng 15 phút                                                                                                                             |
| 5   | Làm trước bước 6 (A gửi yêu cầu bảo hành, trung tâm mở phiếu, ghi biên bản kèm ảnh, đóng phiếu)                            | Giữ ảnh biên bản để chiếu                                                                                                                                              |
| 6   | Mở hộ chiếu công khai, kiểm tra **Khớp blockchain** và **Tự kiểm tra bằng trình duyệt** đều xanh                           | Nếu "Đang cập nhật", đợi vài giây cho Worker chốt                                                                                                                      |
| 7   | Ghi lại: mã công khai, địa chỉ ví A và ví Tài khoản giả                                                                    | Dùng cho `demo:reverts`                                                                                                                                                |
| 8   | Quay video dự phòng toàn bộ 13 bước                                                                                        | Phòng khi mạng hoặc RPC công khai chậm lúc báo cáo                                                                                                                     |

### 2.2. Trong buổi demo

Làm bước 5, 7–13 như bảng ở mục 1.3. Khác biệt trên Monad:

- Sau mỗi lần ký MetaMask, bấm txHash để mở **MonadVision**: chỉ cho hội đồng thấy hàm contract, ví gửi, event, block.
- Bước 9, 11, 12 chạy:

  ```powershell
  $env:DEMO_OWNER_ADDRESS="<ví của A>"; $env:DEMO_FAKE_ADDRESS="<ví Tài khoản giả>"
  pnpm --filter @dpp/api demo:reverts <mã công khai>
  ```

  Script chỉ gọi thử (`eth_call`), không gửi giao dịch, không tốn MON. Muốn hội đồng thấy giao dịch bị revert trên MonadVision thì phải gửi thật từ MetaMask; web đã chặn trước nên cách này cần gọi contract bằng công cụ khác, không khuyến khích khi demo.

- Số liệu hiệu năng: mở `docs/benchmark/monad-testnet.md` (chạy `bench:monad` trước buổi demo, xem [m13-benchmark-hardening.md](m13-benchmark-hardening.md) mục 2).

### 2.3. Khi có sự cố

| Hiện tượng                     | Xử lý                                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| MetaMask báo sai mạng          | Chọn Monad Testnet (chain 10143) rồi bấm lại                                                                                     |
| Web chờ xác nhận lâu           | RPC công khai đang chậm: đợi; `/system/status` cho biết Indexer có đang chậm không. Không bấm gửi lại (sẽ tạo giao dịch thứ hai) |
| Hộ chiếu báo **Đang cập nhật** | Giao dịch vừa xong, Worker chưa chốt: tải lại sau vài giây                                                                       |
| Mất mạng tại phòng báo cáo     | Chuyển sang demo Hardhat local (mục 1) hoặc chiếu video dự phòng                                                                 |
